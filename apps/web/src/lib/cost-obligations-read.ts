import { readCostMonth } from "./monthly-costs.ts";

import { readCostObligations, type CostSql } from "./cost-obligations-core.ts";

import type { ErpCostState } from "./monthly-cost-erp-domain.ts";

export async function readCostPaymentWorkspace(
  tx: CostSql,
  companyId: number,
  month: string,
  today: string,
) {
  const state = (
    await tx.query<{ state: ErpCostState }>(
      "SELECT state FROM admin_monthly_cost_ledger WHERE empresa_id=$1",
      [companyId],
    )
  ).rows[0]?.state;

  if (!state) throw Error("Primero iniciá el circuito de costos mensuales");

  const costs = readCostMonth(state, month).rows;

  const legacySalaries = (await tx.query<{costId:string;amountCents:string}>(`SELECT 'salary:'||c.id::text AS "costId",(SUM(m.monto)*100)::bigint::text AS "amountCents" FROM admin_sueldos_config c JOIN admin_sueldo_movimientos m ON m.empresa_id=c.empresa_id AND c.profile_id IS NOT NULL AND m.profile_id=c.profile_id WHERE c.empresa_id=$1 AND m.periodo>=($2||'-01')::date AND m.periodo<($2||'-01')::date+INTERVAL '1 month' AND m.tipo IN ('pago','retiro') AND m.monto<>0 GROUP BY c.id`,[companyId,month])).rows.map(r=>({...r,amountCents:Number(r.amountCents)}));
  const obligations = await readCostObligations(tx, companyId);

  const accounts = (
    await tx.query<{ id: string; name: string }>(
      "SELECT id::text,name FROM admin_treasury_accounts WHERE empresa_id=$1 AND active AND currency='ARS' ORDER BY name",
      [companyId],
    )
  ).rows;

  const movements = (
    await tx.query<{
      id: string;
      accountId: string;
      date: string;
      amountCents: string;
      concept: string;
      account: string;
      linked: boolean;
      sourceType: string;
    }>(
      `SELECT m.id::text,m.account_id::text AS "accountId",m.movement_date::text AS date,(m.amount*100)::bigint::text AS "amountCents",m.concept,a.name AS account,m.source_type AS "sourceType",EXISTS(SELECT 1 FROM admin_cost_obligation_payments p WHERE p.movement_id=m.id AND p.reversed_at IS NULL) AS linked

 FROM admin_treasury_movements m JOIN admin_treasury_accounts a ON a.id=m.account_id AND a.empresa_id=m.empresa_id

 WHERE m.empresa_id=$1 AND m.direction='outflow' AND m.source_type IN ('manual','monthly_cost_payment') AND m.movement_date>=($2||'-01')::date ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,
      [companyId, state.baselineMonth],
    )
  ).rows.map((m) => ({ ...m, amountCents: Number(m.amountCents) }));

  const payments = (await tx.query<{id:string;obligationId:string;concept:string;date:string;account:string;amountCents:string;reversed:boolean;manual:boolean;reversalDate:string|null;reason:string|null}>(`SELECT p.id,p.obligation_id AS "obligationId",o.concept,m.movement_date::text AS date,a.name AS account,p.amount_cents::text AS "amountCents",(r.payment_id IS NOT NULL) AS reversed,(m.source_type='manual') AS manual,r.reversal_date::text AS "reversalDate",r.reason
 FROM admin_cost_obligation_payments p JOIN admin_cost_obligations o ON o.id=p.obligation_id AND o.empresa_id=p.empresa_id JOIN admin_treasury_movements m ON m.id=p.movement_id AND m.empresa_id=p.empresa_id JOIN admin_treasury_accounts a ON a.id=m.account_id AND a.empresa_id=p.empresa_id LEFT JOIN admin_cost_payment_reversals r ON r.payment_id=p.id AND r.empresa_id=p.empresa_id WHERE p.empresa_id=$1 AND o.month=$2 ORDER BY p.created_at DESC`,[companyId,month])).rows.map(p=>({...p,amountCents:Number(p.amountCents)}));
  return {
    payments,
    legacySalaries,
    month,
    today,
    revision: state.revision,
    baselineMonth: state.baselineMonth,
    costs,
    obligations,
    accounts,
    movements,
  };
}

export type CostPaymentWorkspace = Awaited<
  ReturnType<typeof readCostPaymentWorkspace>
>;
