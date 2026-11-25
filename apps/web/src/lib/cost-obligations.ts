import { withCompanyContext, queryWithCompanyContext } from "@/lib/db";
import { readCostObligations } from "./cost-obligations-core";
export async function readMonthlyExpenseObligations(companyId: number) {
  if (process.env.COST_OBLIGATIONS_ENABLED !== "true") return [];
  const ready = await queryWithCompanyContext<{ ready: boolean }>(
    companyId,
    "SELECT to_regclass('public.admin_cost_obligations') IS NOT NULL AS ready",
    [],
    { cache: false },
  );
  if (!ready.rows[0]?.ready) return [];
  return withCompanyContext(companyId, (tx) =>
    readCostObligations(tx, companyId).then(rows=>rows.filter(o=>!o.cancelled)),
  );
}
