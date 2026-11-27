import { queryWithCompanyContext } from "@/lib/db";
import { CUSTOMER_BUSINESS_SEGMENTS } from "@/lib/customer-segments";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { buildSegmentGuide, segmentGuidePeriod, type SegmentGuideRow } from "@/lib/segment-guide-domain";

/** Company aggregates intentionally shared with sellers; never return customer identities. */
export async function getSegmentGuide(companyId: number, now = new Date()) {
  const period = segmentGuidePeriod(now);
  const result = await queryWithCompanyContext<SegmentGuideRow>(companyId, `
    WITH eligible_sales AS (
      SELECT s.id, s.empresa_id, s.client_id, BTRIM(c.business_segment) AS segment
      FROM sales s
      JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE s.empresa_id = $1
        AND NULLIF(BTRIM(c.business_segment), '') IS NOT NULL
        AND s.sale_date >= $2::date AND s.sale_date < $3::date
        AND ${normalizedOrderStatusSql("s")} = 'entregado'
        AND ${canonicalSalesSourceSql("s")}
    ), movements AS (
      SELECT s.id AS sale_id, s.client_id, s.segment, si.product_id::text AS product_id, si.quantity AS quantity
      FROM eligible_sales s
      JOIN sale_items si ON si.sale_id = s.id AND si.empresa_id = s.empresa_id
      WHERE si.product_id IS NOT NULL AND si.quantity > 0
      UNION ALL
      SELECT s.id, s.client_id, s.segment, entry->>'id',
             CASE WHEN d.class_name = 'NC' THEN -1 ELSE 1 END *
             CASE WHEN entry->>'quantity' ~ '^[0-9]+([.][0-9]+)?$' THEN (entry->>'quantity')::numeric ELSE 0 END
      FROM eligible_sales s
      JOIN sales_internal_documents d ON d.sale_id = s.id AND d.empresa_id = s.empresa_id
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.detail_json) = 'array' THEN d.detail_json ELSE '[]'::jsonb END) entry
      WHERE d.class_name IN ('NC', 'ND') AND (d.fiscal = false OR d.operational_document_id IS NULL)
        AND entry->>'quantity' ~ '^[0-9]+([.][0-9]+)?$'
    ), purchases AS (
      SELECT m.sale_id, m.client_id, m.segment, p.id::text AS product_id,
             p.name AS product_name, p.sku AS product_code, p.presentation_units,
             SUM(m.quantity) AS quantity
      FROM movements m
      JOIN products p ON p.id::text = m.product_id AND p.empresa_id = $1 AND p.active = true
      GROUP BY m.sale_id, m.client_id, m.segment, p.id, p.name, p.sku, p.presentation_units
      HAVING SUM(m.quantity) > 0
    ), cohorts AS (
      SELECT segment, COUNT(DISTINCT client_id) AS customer_count, COUNT(DISTINCT sale_id) AS order_count
      FROM purchases GROUP BY segment
    ), product_stats AS (
      SELECT segment, product_id, product_name, product_code, presentation_units,
             COUNT(DISTINCT client_id) AS buyers, COUNT(*) AS product_orders, AVG(quantity) AS average_quantity
      FROM purchases GROUP BY segment, product_id, product_name, product_code, presentation_units
    ), registered AS (
      SELECT DISTINCT BTRIM(business_segment) AS segment FROM clients
      WHERE empresa_id = $1 AND NULLIF(BTRIM(business_segment), '') IS NOT NULL
    )
    SELECT r.segment, COALESCE(c.customer_count,0)::text AS customer_count, COALESCE(c.order_count,0)::text AS order_count,
           p.product_id, p.product_name, p.product_code, p.presentation_units::text,
           p.buyers::text, p.product_orders::text, p.average_quantity::text
    FROM registered r LEFT JOIN cohorts c USING(segment) LEFT JOIN product_stats p USING(segment)
    ORDER BY r.segment, p.buyers DESC, p.product_orders DESC, p.product_name
  `, [companyId, period.from, period.until], {cache: false});
  return buildSegmentGuide(result.rows, CUSTOMER_BUSINESS_SEGMENTS, period);
}
