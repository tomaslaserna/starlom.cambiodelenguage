import { NextResponse } from "next/server";
import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import {
  HISTORICAL_SALES_START_DATE,
  LEGACY_CLOSED_SALES_COUNT,
} from "@/lib/public-metrics";

export async function GET() {
  const result = await queryWithCompanyContext<{
    closed_sales: string;
    historical_from: string | null;
    updated_through: string | null;
  }>(
    1,
    `SELECT COUNT(*) FILTER (WHERE ${normalizedOrderStatusSql("s")} = 'entregado')::text AS closed_sales,
            MIN(s.sale_date) FILTER (WHERE ${normalizedOrderStatusSql("s")} = 'entregado')::text AS historical_from,
            MAX(s.sale_date) FILTER (WHERE ${normalizedOrderStatusSql("s")} = 'entregado')::text AS updated_through
       FROM sales s
      WHERE s.empresa_id = $1
        AND ${canonicalSalesSourceSql("s")}`,
    [1],
  );
  const row = result.rows[0];
  const erpClosedSales = Number(row?.closed_sales ?? 0);

  return NextResponse.json(
    {
      closedSales: LEGACY_CLOSED_SALES_COUNT + erpClosedSales,
      historicalFrom: HISTORICAL_SALES_START_DATE,
      updatedThrough: row?.updated_through ?? null,
    },
    { headers: { "Cache-Control": "public, s-maxage=90, stale-while-revalidate=300" } },
  );
}
