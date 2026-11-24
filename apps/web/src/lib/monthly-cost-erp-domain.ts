import { createMonthlyCost, type NewMonthlyCost, decideCostMonth, editCostFromMonth, restoreMonthlyCosts, saveCostMonth, type MonthlyCostState, type MonthlyCost } from './monthly-costs.ts';
export type MonthlyCostSource = {
 companyId:number; capturedAt:string; baselineMonth:string;
 salaries:{id:string;name:string;monthly:number;active:boolean;bonus:boolean;chargesPercent:number}[];
 expenses:{id:string;name:string;amount:number;start:string;durationMonths:number|null;active:boolean}[];
 decisions:{costId:string;month:string;included:boolean}[];
};
export type ErpCostState=MonthlyCostState & {companyId:number;baselineMonth:string;capturedAt:string;excluded:{costId:string;salaryId:string;name:string;amountCents:number}[]};
export type CostCommand=({intent:'create';expectedRevision:number}&NewMonthlyCost)|{intent:'save';month:string;expectedRevision:number}|{intent:'edit';id:string;month:string;amountCents:number;active:boolean;expectedRevision:number}|{intent:'decide';id:string;month:string;included:boolean;expectedRevision:number};
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const cents=(n:number)=>{const c=Math.round(n*100);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(c)||Math.abs(c/100-n)>0.000001)throw new Error('Importe de origen inválido');return c;};
const distance=(a:string,b:string)=>(Number(b.slice(0,4))-Number(a.slice(0,4)))*12+Number(b.slice(5))-Number(a.slice(5));
export function importMonthlyCostSource(source:MonthlyCostSource):ErpCostState {
 if(!Number.isSafeInteger(source.companyId)||source.companyId<=0||!Number.isFinite(Date.parse(source.capturedAt))||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(source.baselineMonth))throw new Error('Origen inválido');
 const state:ErpCostState={schema:1,revision:0,companyId:source.companyId,baselineMonth:source.baselineMonth,capturedAt:source.capturedAt,costs:[],decisions:{},snapshots:{},events:[],excluded:[]};
 for(const s of source.salaries)state.costs.push({id:`salary:${s.id}`,name:s.name,source:'salary',start:source.baselineMonth,durationMonths:null,versions:[{from:source.baselineMonth,amountCents:cents(s.monthly),active:s.active,bonus:s.bonus,chargesPercent:s.chargesPercent}]});
 for(const c of source.expenses) {
   if(!c.active||c.durationMonths!==null&&distance(c.start,source.baselineMonth)>=c.durationMonths)continue;
   const matches=source.salaries.filter(s=>s.active&&cents(s.monthly)===cents(c.amount)&&['sueldo','salario'].some(prefix=>[`${prefix} ${normalize(s.name)}`,`${prefix} ${normalize(s.name).split(' ')[0]}`].includes(normalize(c.name))));
   if(matches.length===1) {state.excluded.push({costId:`expense:${c.id}`,salaryId:`salary:${matches[0].id}`,name:c.name,amountCents:cents(c.amount)});continue;}
   const cost:MonthlyCost={id:`expense:${c.id}`,name:c.name,source:'expense',start:c.start,durationMonths:c.durationMonths,versions:[{from:source.baselineMonth>c.start?source.baselineMonth:c.start,amountCents:cents(c.amount),active:c.active,bonus:false,chargesPercent:0}]};
   state.costs.push(cost);
   if(c.start===source.baselineMonth&&c.durationMonths===null)state.decisions[source.baselineMonth]={...state.decisions[source.baselineMonth],[cost.id]:true};
 }
 for(const d of source.decisions)if(state.costs.some(c=>c.id===`expense:${d.costId}`))state.decisions[d.month]={...state.decisions[d.month],[`expense:${d.costId}`]:d.included};
 restoreMonthlyCosts(JSON.stringify(state));return state;
}
export function applyMonthlyCostCommand(state:ErpCostState,command:CostCommand,actor:string):ErpCostState {
 if(!actor||!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision!==state.revision)throw new Error('La información cambió. Actualizá antes de guardar');
 let next:MonthlyCostState;
 if(command.intent==='create')next=createMonthlyCost(state,command,`${command.source}:new:${crypto.randomUUID()}`);
 else if(command.intent==='save')next=saveCostMonth(state,command.month);
 else if(command.intent==='edit')next=editCostFromMonth(state,command.id,command.month,command.amountCents,command.active);
 else if(command.intent==='decide')next=decideCostMonth(state,command.id,command.month,command.included);
 else throw new Error('Acción inválida');
 next.events[next.events.length-1].actor=actor;
 return next as ErpCostState;
}
export function restoreErpCostState(raw:string):ErpCostState {
 const s=restoreMonthlyCosts(raw) as ErpCostState;
 if(!Number.isSafeInteger(s.companyId)||s.companyId<=0||!s.baselineMonth||!s.capturedAt||!Array.isArray(s.excluded))throw new Error('Estado de empresa inválido');
 return s;
}
