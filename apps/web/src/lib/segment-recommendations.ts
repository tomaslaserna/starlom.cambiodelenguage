import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";

export type SegmentRecommendation = {
  segment: string;
  productId: string;
  typicalQuantity: number;
  customerCoveragePercent: number;
  customerCount: number;
  provisional: boolean;
};

export async function listSegmentRecommendations(companyId: number): Promise<SegmentRecommendation[]> {
  const rows = await queryWithCompanyContext<{
    segment: string;
    product_id: string;
    typical_quantity: string;
    coverage_percent: string;
    customer_count: string;
    provisional: boolean;
  }>(companyId, `
    WITH segmented_clients AS (
      SELECT id,
             COALESCE(business_segment,
               CASE WHEN business_segment_confidence >= 0.85 THEN business_segment_suggested END
             ) AS segment,
             business_segment IS NULL AS provisional
        FROM clients
       WHERE empresa_id = $1
         AND active = true
         AND COALESCE(business_segment,
               CASE WHEN business_segment_confidence >= 0.85 THEN business_segment_suggested END
             ) IS NOT NULL
    ),
    segment_sizes AS (
      SELECT segment, COUNT(*)::numeric AS customers
        FROM segmented_clients
       GROUP BY segment
    ),
    purchase_lines AS (
      SELECT sc.segment, sc.provisional, s.client_id, si.product_id,
             GREATEST(si.quantity, 0)::numeric AS quantity
        FROM segmented_clients sc
        JOIN sales s ON s.client_id = sc.id AND s.empresa_id = $1
        JOIN sale_items si ON si.sale_id = s.id AND si.empresa_id = s.empresa_id
        JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id AND p.active = true
       WHERE ${normalizedOrderStatusSql("s")} = 'entregado'
         AND ${canonicalSalesSourceSql("s")}
         AND si.product_id IS NOT NULL
         AND si.quantity > 0
    ),
    ranked AS (
      SELECT pl.segment, pl.product_id,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY pl.quantity)::numeric AS typical_quantity,
             COUNT(DISTINCT pl.client_id)::numeric AS customers_buying,
             ss.customers,
             BOOL_AND(pl.provisional) AS provisional,
             ROW_NUMBER() OVER (
               PARTITION BY pl.segment
               ORDER BY COUNT(DISTINCT pl.client_id) DESC, COUNT(*) DESC, pl.product_id
             ) AS position
        FROM purchase_lines pl
        JOIN segment_sizes ss ON ss.segment = pl.segment
       GROUP BY pl.segment, pl.product_id, ss.customers
    )
    SELECT segment, product_id::text, GREATEST(1, ROUND(typical_quantity))::text AS typical_quantity,
           ROUND(customers_buying * 100 / NULLIF(customers, 0), 1)::text AS coverage_percent,
           customers::text AS customer_count, provisional
      FROM ranked
     WHERE position <= 10
       AND customers_buying >= CASE WHEN customers >= 5 THEN 2 ELSE 1 END
     ORDER BY segment, position
  `, [companyId]);

  return rows.rows.map((row) => ({
    segment: row.segment,
    productId: row.product_id,
    typicalQuantity: Number(row.typical_quantity),
    customerCoveragePercent: Number(row.coverage_percent),
    customerCount: Number(row.customer_count),
    provisional: row.provisional,
  }));
}

