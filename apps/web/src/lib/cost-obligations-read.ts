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

  const costs = readCostMonth(state, month).rows.filter(
    (r) => r.source === "expense",
  );

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
    }>(
      `SELECT m.id::text,m.account_id::text AS "accountId",m.movement_date::text AS date,(m.amount*100)::bigint::text AS "amountCents",m.concept,a.name AS account,EXISTS(SELECT 1 FROM admin_cost_obligation_payments p WHERE p.movement_id=m.id) AS linked

 FROM admin_treasury_movements m JOIN admin_treasury_accounts a ON a.id=m.account_id AND a.empresa_id=m.empresa_id

 WHERE m.empresa_id=$1 AND m.direction='outflow' AND m.source_type IN ('manual','monthly_cost_payment') AND m.movement_date>=($2||'-01')::date ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,
      [companyId, state.baselineMonth],
    )
  ).rows.map((m) => ({ ...m, amountCents: Number(m.amountCents) }));

  return {
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
