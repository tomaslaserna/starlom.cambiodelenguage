import { queryWithCompanyContext, withCompanyContext } from '@/lib/db';
import { ApiError } from '@/lib/api-response';
import { applyMonthlyCostCommand, importMonthlyCostSource, restoreErpCostState, type CostCommand, type MonthlyCostSource } from './monthly-cost-erp-domain';
import { monthlyCostSourceSql } from './monthly-cost-source-sql';
import { readCostMonth } from './monthly-costs';

export async function readMonthlyCostLedger(companyId:number) {
 const table=await queryWithCompanyContext<{available:boolean}>(companyId,"SELECT to_regclass('public.admin_monthly_cost_ledger') IS NOT NULL AS available",[],{cache:false});
 if(!table.rows[0]?.available)return null;
 const result=await queryWithCompanyContext<{state:unknown;source_snapshot:MonthlyCostSource}>(companyId,'SELECT state, source_snapshot FROM admin_monthly_cost_ledger WHERE empresa_id=$1',[companyId],{cache:false});
 if(!result.rows[0])return null;
 const state=restoreErpCostState(JSON.stringify(result.rows[0].state));
 if(state.companyId!==companyId)throw new ApiError(409,'La configuración no pertenece a esta empresa');
 return {state,source:result.rows[0].source_snapshot};
}
export async function readMonthlyCostSource(companyId:number,month:string) {
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new ApiError(400,'Mes inválido');
 const r=await queryWithCompanyContext<{source:MonthlyCostSource}>(companyId,monthlyCostSourceSql,[companyId,month],{cache:false});
 return r.rows[0].source;
}
export async function initializeMonthlyCostLedger(companyId:number,userId:string,month:string) {
 if(process.env.MONTHLY_COST_LEDGER_ENABLED!=='true')throw new ApiError(409,'La integración mensual todavía no está habilitada');
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new ApiError(400,'Mes inválido');
 return withCompanyContext(companyId,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(71624,$1::integer)',[companyId]);
  const exists=await client.query('SELECT empresa_id FROM admin_monthly_cost_ledger WHERE empresa_id=$1',[companyId]);
  if(exists.rows.length)throw new ApiError(409,'La integración ya fue iniciada. Actualizá la pantalla');
  const closed=await client.query("SELECT 1 FROM admin_finance_monthly_closures WHERE empresa_id=$1 AND status='closed' AND month>=($2||'-01')::date LIMIT 1",[companyId,month]);
  if(closed.rows.length)throw new ApiError(409,'El inicio debe ser posterior a los meses ya cerrados');
  const source=await client.query<{source:MonthlyCostSource}>(monthlyCostSourceSql,[companyId,month]);
  const state=importMonthlyCostSource(source.rows[0].source);
  await client.query('INSERT INTO admin_monthly_cost_ledger(empresa_id,state,source_snapshot,updated_by) VALUES($1,$2::jsonb,$3::jsonb,$4::uuid)',[companyId,JSON.stringify(state),JSON.stringify(source.rows[0].source),userId]);
  return state;
 });
}
export async function mutateMonthlyCostLedger(companyId:number,userId:string,command:CostCommand) {
 if(process.env.MONTHLY_COST_LEDGER_ENABLED!=='true')throw new ApiError(409,'La integración mensual todavía no está habilitada');
 return withCompanyContext(companyId,async client=>{
  const r=await client.query<{state:unknown}>('SELECT state FROM admin_monthly_cost_ledger WHERE empresa_id=$1 FOR UPDATE',[companyId]);
  if(!r.rows[0])throw new ApiError(409,'Primero iniciá la integración mensual');
  const state=restoreErpCostState(JSON.stringify(r.rows[0].state));
  if(state.companyId!==companyId)throw new ApiError(409,'Empresa inválida');
  let next;
  try {next=applyMonthlyCostCommand(state,command,userId);}catch(e){throw new ApiError(409,e instanceof Error?e.message:'Cambio inválido');}
  if(process.env.COST_OBLIGATIONS_ENABLED==='true'){
   const linked=await client.query<{cost_id:string;month:string;amount_cents:string}>('SELECT cost_id,month,amount_cents::text FROM admin_cost_obligations WHERE empresa_id=$1',[companyId]);
   for(const o of linked.rows){const row=readCostMonth(next,o.month).rows.find(r=>r.id===o.cost_id);if(!row||row.totalCents!==Number(o.amount_cents))throw new ApiError(409,'Este mes ya tiene una obligación programada. Aplicá el cambio desde un mes posterior.');}
  }
  await client.query('UPDATE admin_monthly_cost_ledger SET state=$2::jsonb,updated_by=$3::uuid,updated_at=now() WHERE empresa_id=$1',[companyId,JSON.stringify(next),userId]);
  return next;
 });
}
export async function assertLegacyCostWritable(companyId:number) {
 if(await readMonthlyCostLedger(companyId))throw new ApiError(409,'Los costos tienen versiones mensuales. Usá Administración → Costos por mes para conservar los históricos.');
}
export async function monthlyCostTotals(companyId:number,month:string) {
 const ledger=await readMonthlyCostLedger(companyId);
 if(!ledger||month<ledger.state.baselineMonth)return null;
 const detail=readCostMonth(ledger.state,month);
 return {total:detail.totalCents/100,salaries:detail.rows.filter(r=>r.source==='salary').reduce((s,r)=>s+r.totalCents,0)/100,expenses:detail.rows.filter(r=>r.source==='expense').reduce((s,r)=>s+r.totalCents,0)/100,pending:detail.pending};
}

// Read-only estimate: changing a cost never creates a salary payment.
export async function monthlyPayrollPayables(companyId:number,month:string) {
 const ledger=await readMonthlyCostLedger(companyId);
 if(!ledger||month<ledger.state.baselineMonth)return null;
 const paid=await queryWithCompanyContext<{id:string;paid:string}>(companyId,`
  SELECT c.id::text, COALESCE(SUM(m.monto),0)::text AS paid
  FROM admin_sueldos_config c LEFT JOIN admin_sueldo_movimientos m
   ON m.empresa_id=c.empresa_id AND c.profile_id IS NOT NULL AND m.profile_id=c.profile_id
   AND m.periodo>=($2||'-01')::date AND m.periodo<($2||'-01')::date+INTERVAL '1 month'
   AND m.tipo IN ('pago','retiro')
  WHERE c.empresa_id=$1 GROUP BY c.id`,[companyId,month],{cache:false});
 const payments=new Map(paid.rows.map(r=>[`salary:${r.id}`,Number(r.paid)]));
 return readCostMonth(ledger.state,month).rows.filter(r=>r.source==='salary').map(r=>{
  const total=r.totalCents/100,payment=payments.get(r.id)??0;
  return {id:r.id.slice(7),employee:r.name,total,paid:payment,balance:Math.max(0,Math.round((total-payment)*100)/100)};
 });
}

export async function monthlyCostAdjustment(companyId:number,from:string,toExclusive:string) {
 const ledger=await readMonthlyCostLedger(companyId);
 const delta={total:0,salaries:0,expenses:0};
 if(!ledger)return delta;
 const legacy=importMonthlyCostSource(ledger.source);
 let month=from.slice(0,7)>ledger.state.baselineMonth?from.slice(0,7):ledger.state.baselineMonth;
 for(let guard=0;month<toExclusive.slice(0,7)&&guard<1200;guard++) {
  const current=readCostMonth(ledger.state,month),old=readCostMonth(legacy,month);
  const payroll=ledger.source.salaries.filter(s=>s.active).reduce((a,s)=>a+s.monthly+(s.bonus?s.monthly/12:0)+s.monthly*s.chargesPercent/100,0);
  const oldExpenses=old.rows.filter(r=>r.source==='expense').reduce((a,r)=>a+r.totalCents,0)/100;
  const newExpenses=current.rows.filter(r=>r.source==='expense').reduce((a,r)=>a+r.totalCents,0)/100;
  const newPayroll=current.rows.filter(r=>r.source==='salary').reduce((a,r)=>a+r.totalCents,0)/100;
  delta.salaries+=newPayroll-payroll;delta.expenses+=newExpenses-oldExpenses;
  const date=new Date(`${month}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7);
 }
 delta.total=delta.salaries+delta.expenses;return delta;
}
