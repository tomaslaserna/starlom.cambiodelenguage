import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";

const STARLIM_COMPANY_ID = 1;

// Audited from the historical monthly balance workbooks in Drive. These sales
// predate the canonical ERP dataset, so they are added once to the live count.
export const LEGACY_CLOSED_SALES_COUNT = 1_564;
export const HISTORICAL_SALES_START_DATE = "2023-04-12";

export async function getPublicClosedSalesCount() {
  try {
    const result = await queryWithCompanyContext<{ total: string }>(
      STARLIM_COMPANY_ID,
      `
        SELECT COUNT(*)::text AS total
          FROM sales s
         WHERE s.empresa_id = $1
           AND ${canonicalSalesSourceSql("s")}
           AND ${normalizedOrderStatusSql("s")} = 'entregado'
      `,
      [STARLIM_COMPANY_ID],
    );

    const erpTotal = Number(result.rows[0]?.total ?? 0);
    return Number.isSafeInteger(erpTotal) && erpTotal >= 0
      ? LEGACY_CLOSED_SALES_COUNT + erpTotal
      : null;
  } catch (error) {
    console.error("Unable to load public closed sales count", error);
    return null;
  }
}
