// Pure model for the local monthly-cost pilot. No ERP reads or writes.
export type CostVersion = { from: string; amountCents: number; active: boolean; bonus: boolean; chargesPercent: number };
export type MonthlyCost = { id: string; name: string; source: 'salary' | 'expense'; start: string; costType?: 'fijo' | 'variable' | 'unico'; durationMonths: number | null; versions: CostVersion[] };
export type CostMonthRow = { id: string; name: string; source: MonthlyCost['source']; versionFrom: string; amountCents: number; provisionCents: number; chargesCents: number; totalCents: number; status: 'included' | 'pending' | 'suspended' | 'inactive' | 'expired' };
export type CostMonth = { month: string; rows: CostMonthRow[]; totalCents: number; pending: number; savedAt?: string };
export type MonthlyCostState = { schema: 1; revision: number; baselineMonth?: string; costs: MonthlyCost[]; decisions: Record<string, Record<string, boolean>>; snapshots: Record<string, CostMonth>; events: { action: string; month: string; costId?: string; at: string; actor?: string }[] };

function checkMonth(month: string) { if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes inválido (AAAA-MM)'); }
function checkMoney(cents: number) { if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Importe inválido'); }
function sumMoney(values: number[]) { const sum = values.reduce((a,b)=>a+b,0); checkMoney(sum); return sum; }
function distance(from: string,to: string) { return (Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5))-Number(from.slice(5)); }
function findCost(state: MonthlyCostState,id: string) { const cost=state.costs.find(c=>c.id===id); if(!cost) throw new Error('Costo no encontrado'); return cost; }
function assertEditable(state: MonthlyCostState,month: string) {
  checkMonth(month);
  if(state.baselineMonth&&month<state.baselineMonth) throw new Error('El histórico anterior al inicio se conserva en el ERP, sin recalcular');
  const last=Object.keys(state.snapshots).sort().at(-1);
  if(last && month<=last) throw new Error(`El período ya está protegido por un mes guardado (${last}). Elegí un mes posterior.`);
}
function event(state: MonthlyCostState, action: string, month: string, costId?: string) {
  state.revision++;
  state.events.push({action,month,...(costId?{costId}:{}),at:new Date().toISOString()});
}
export function readCostMonth(state: MonthlyCostState,month: string): CostMonth {
  checkMonth(month);
  if(state.baselineMonth&&month<state.baselineMonth) throw new Error('El histórico anterior al inicio se conserva en el ERP, sin recalcular');
  if(state.snapshots[month]) return structuredClone(state.snapshots[month]);
  const rows=state.costs.map((cost):CostMonthRow=>{
    const version=cost.versions.filter(v=>v.from<=month).sort((a,b)=>a.from.localeCompare(b.from)).at(-1);
    const elapsed=distance(cost.start,month);
    const valid=version && elapsed>=0 && (cost.durationMonths===null || elapsed<cost.durationMonths);
    const decision=state.decisions[month]?.[cost.id];
    const status=!valid?'expired':!version.active?'inactive':cost.source==='expense'&&cost.durationMonths===null ? decision===undefined?'pending':decision?'included':'suspended':'included';
    const amountCents=version?.amountCents??0;
    const provisionCents=cost.source==='salary'&&version?.bonus?Math.round(amountCents/12):0;
    const chargesCents=cost.source==='salary'?Math.round(amountCents*(version?.chargesPercent??0)/100):0;
    const totalCents=status==='included'?sumMoney([amountCents,provisionCents,chargesCents]):0;
    return {id:cost.id,name:cost.name,source:cost.source,versionFrom:version?.from??cost.start,amountCents,provisionCents,chargesCents,totalCents,status};
  });
  return {month,rows,totalCents:sumMoney(rows.map(r=>r.totalCents)),pending:rows.filter(r=>r.status==='pending').length};
}
export type NewMonthlyCost = {name:string;source:'salary'|'expense';month:string;amountCents:number;durationMonths:number|null;costType:'fijo'|'variable'|'unico';bonus:boolean;chargesPercent:number};
export function createMonthlyCost(state:MonthlyCostState,input:NewMonthlyCost,id:string) {
  assertEditable(state,input.month);checkMoney(input.amountCents);
  if(!['salary','expense'].includes(input.source)||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>150)throw new Error('Nombre o tipo inválido');
  if(!['fijo','variable','unico'].includes(input.costType)||input.durationMonths!==null&&(!Number.isInteger(input.durationMonths)||input.durationMonths<1||input.durationMonths>600))throw new Error('Duración o etiqueta inválida');
  if(input.costType==='unico'&&input.durationMonths!==1)throw new Error('Un costo único dura un mes');
  if(typeof input.bonus!=='boolean'||!Number.isFinite(input.chargesPercent)||input.chargesPercent<0||input.chargesPercent>100||input.source==='expense'&&(input.bonus||input.chargesPercent!==0))throw new Error('Aguinaldo o cargas inválidos');
  const normalize=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(!normalize(input.name))throw new Error('Nombre inválido');
  if(state.costs.some(c=>c.source===input.source&&normalize(c.name)===normalize(input.name)))throw new Error('El concepto ya existe. Editá su vigencia para evitar duplicarlo');
  if(!id||state.costs.some(c=>c.id===id))throw new Error('Identificador inválido');
  const next=structuredClone(state);
  next.costs.push({id,name:input.name.trim(),source:input.source,start:input.month,costType:input.costType,durationMonths:input.durationMonths,versions:[{from:input.month,amountCents:input.amountCents,active:true,bonus:input.bonus,chargesPercent:input.chargesPercent}]});
  if(input.source==='expense'&&input.durationMonths===null)next.decisions[input.month]={...next.decisions[input.month],[id]:true};
  event(next,'Alta de concepto',input.month,id);return next;
}
export function editCostFromMonth(state: MonthlyCostState,id: string,month: string,amountCents: number,active: boolean) {
  assertEditable(state,month); checkMoney(amountCents);
  if(typeof active!=='boolean') throw new Error('Estado inválido');
  const next=structuredClone(state),cost=findCost(next,id);
  if(month<cost.start) throw new Error('El cambio es anterior al inicio del costo');
  const base=cost.versions.filter(v=>v.from<=month).sort((a,b)=>a.from.localeCompare(b.from)).at(-1);
  if(!base) throw new Error('No hay condiciones de origen');
  cost.versions=[...cost.versions.filter(v=>v.from!==month),{...base,from:month,amountCents,active}].sort((a,b)=>a.from.localeCompare(b.from));
  event(next,'Cambio de condiciones',month,id); return next;
}
export function decideCostMonth(state: MonthlyCostState,id: string,month: string,included: boolean) {
  assertEditable(state,month);
  const cost=findCost(state,id),row=readCostMonth(state,month).rows.find(r=>r.id===id)!;
  if(cost.source!=='expense'||cost.durationMonths!==null||row.status==='expired'||row.status==='inactive') throw new Error('El costo no admite confirmación en esta vigencia');
  if(typeof included!=='boolean') throw new Error('Decisión inválida');
  const next=structuredClone(state); next.decisions[month]={...next.decisions[month],[id]:included};
  event(next,included?'Incluido en el mes':'Suspendido en el mes',month,id); return next;
}
export function saveCostMonth(state: MonthlyCostState,month: string) {
  assertEditable(state,month);
  const last=Object.keys(state.snapshots).sort().at(-1);
  if(last&&distance(last,month)!==1) throw new Error('Guardá primero los meses intermedios para no dejar históricos sin revisar');
  if(!last&&state.baselineMonth&&month!==state.baselineMonth) throw new Error('Guardá primero el mes de inicio');
  const detail=readCostMonth(state,month);
  if(detail.pending) throw new Error('Falta confirmar o suspender los gastos indefinidos');
  const next=structuredClone(state); next.snapshots[month]={...detail,savedAt:new Date().toISOString()};
  event(next,'Mes guardado',month); return next;
}
export function demoMonthlyCosts(): MonthlyCostState {
  const version: CostVersion={from:'2026-10',amountCents:80000000,active:true,bonus:false,chargesPercent:0};
  const state: MonthlyCostState={schema:1,revision:0,costs:[
    {id:'salary',name:'Sueldo · empleado de ejemplo',source:'salary',start:'2026-10',durationMonths:null,versions:[{...version}]},
    {id:'rent',name:'Alquiler · ejemplo',source:'expense',start:'2026-10',durationMonths:null,versions:[{...version}]},
    {id:'marketing',name:'Marketing · ejemplo',source:'expense',start:'2026-10',durationMonths:null,versions:[{...version,amountCents:18500000}]},
  ],decisions:{'2026-10':{rent:true,marketing:true}},snapshots:{},events:[]};
  return saveCostMonth(state,'2026-10');
}

// Local persistence is untrusted. Reject incomplete or inconsistent data, never overwrite it with seeds.
export function restoreMonthlyCosts(raw: string): MonthlyCostState {
  try {
    const s=JSON.parse(raw) as MonthlyCostState;
    if(s.schema!==1||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.costs)||!Array.isArray(s.events)||!s.decisions||!s.snapshots) throw new Error();
    if(s.baselineMonth) checkMonth(s.baselineMonth);
    const ids=new Set<string>();
    for(const c of s.costs) {
      if(!c.id||ids.has(c.id)||typeof c.name!=='string'||!['salary','expense'].includes(c.source)||!Array.isArray(c.versions)||!c.versions.length) throw new Error();
      ids.add(c.id); checkMonth(c.start);
      if(c.costType!==undefined&&!['fijo','variable','unico'].includes(c.costType))throw new Error();
      if(c.durationMonths!==null&&(!Number.isInteger(c.durationMonths)||c.durationMonths<1)) throw new Error();
      const versions=new Set<string>();
      for(const v of c.versions) {
        checkMonth(v.from);checkMoney(v.amountCents);
        if(v.from<c.start||versions.has(v.from)||typeof v.active!=='boolean'||typeof v.bonus!=='boolean'||!Number.isFinite(v.chargesPercent)||v.chargesPercent<0||v.chargesPercent>100) throw new Error();
        versions.add(v.from);
      }
    }
    for(const [month,decisions] of Object.entries(s.decisions)) { checkMonth(month); for(const [id,value] of Object.entries(decisions)) if(!ids.has(id)||typeof value!=='boolean') throw new Error(); }
    for(const [month,snapshot] of Object.entries(s.snapshots)) {
      checkMonth(month);checkMoney(snapshot.totalCents);
      if(snapshot.month!==month||snapshot.pending!==0||!snapshot.savedAt||!Number.isFinite(Date.parse(snapshot.savedAt))||!Array.isArray(snapshot.rows)||snapshot.rows.length>s.costs.length) throw new Error();
      const rowIds=new Set<string>();
      for(const row of snapshot.rows) {
        if(!ids.has(row.id)||rowIds.has(row.id)||typeof row.name!=='string'||!['salary','expense'].includes(row.source)||!['included','suspended','inactive','expired'].includes(row.status)) throw new Error();
        rowIds.add(row.id);checkMonth(row.versionFrom);
        [row.amountCents,row.provisionCents,row.chargesCents,row.totalCents].forEach(checkMoney);
        if(row.totalCents!==(row.status==='included'?sumMoney([row.amountCents,row.provisionCents,row.chargesCents]):0)) throw new Error();
      }
      if(s.costs.some(c=>c.start<=month&&!rowIds.has(c.id)))throw new Error();
      if(sumMoney(snapshot.rows.map(r=>r.totalCents))!==snapshot.totalCents) throw new Error();
    }
    for(const e of s.events) { checkMonth(e.month); if(typeof e.action!=='string'||!Number.isFinite(Date.parse(e.at))||(e.costId&&!ids.has(e.costId))) throw new Error(); }
    return s;
  } catch { throw new Error('Los datos locales no son válidos. No se sobrescribieron; conservá una copia antes de restaurarlos.'); }
}
