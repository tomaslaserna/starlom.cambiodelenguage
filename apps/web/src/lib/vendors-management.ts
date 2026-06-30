import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";

export async function getVendorManagement(companyId: number) {
  const result = await queryWithCompanyContext<{
    vendor: string;
    clients: string;
    sales_count: string;
    sales_total: string;
    quotes_count: string;
    accepted_quotes: string;
    goal_sales: string;
    goal_clients: string;
  }>(
    companyId,
    `
      WITH vendors AS (
        SELECT COALESCE(NULLIF(p.username, ''), NULLIF(p.full_name, ''), p.email) AS vendor
        FROM usuario_empresa ue
        JOIN profiles p ON p.id = ue.id_usuario
        WHERE ue.empresa_id = $1
          AND ue.activo = TRUE
          AND ue.role::text = 'vendedor'
        UNION
        SELECT seller_name AS vendor FROM clients WHERE empresa_id = $1 AND COALESCE(seller_name, '') <> ''
        UNION
        SELECT seller_name AS vendor FROM sales WHERE empresa_id = $1 AND COALESCE(seller_name, '') <> ''
        UNION
        SELECT p.username AS vendor
        FROM quotes q
        JOIN profiles p ON p.id = q.seller_id
        WHERE q.empresa_id = $1 AND COALESCE(p.username, '') <> ''
      ),
      clients AS (
        SELECT seller_name AS vendor, COUNT(*) AS clients
        FROM clients
        WHERE empresa_id = $1 AND COALESCE(seller_name, '') <> ''
        GROUP BY seller_name
      ),
      sales AS (
        SELECT COALESCE(NULLIF(s.seller_name, ''), NULLIF(c.seller_name, '')) AS vendor,
               COUNT(*) AS sales_count,
               COALESCE(SUM(s.total_amount), 0) AS sales_total
        FROM sales s
        LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        WHERE s.empresa_id = $1
          AND ${canonicalSalesSourceSql("s")}
          AND COALESCE(NULLIF(s.seller_name, ''), NULLIF(c.seller_name, '')) IS NOT NULL
          AND s.sale_date >= date_trunc('month', CURRENT_DATE)::date
          AND s.sale_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
        GROUP BY COALESCE(NULLIF(s.seller_name, ''), NULLIF(c.seller_name, ''))
      ),
      quotes AS (
        SELECT p.username AS vendor,
               COUNT(*) AS quotes_count,
               COUNT(*) FILTER (WHERE q.status = 'aceptada') AS accepted_quotes
        FROM quotes q
        JOIN profiles p ON p.id = q.seller_id
        WHERE q.empresa_id = $1 AND COALESCE(p.username, '') <> ''
        GROUP BY p.username
      ),
      goals AS (
        SELECT vendor, goal_sales, goal_clients
        FROM vendor_goals
        WHERE empresa_id = $1
          AND period = date_trunc('month', CURRENT_DATE)::date
      )
      SELECT v.vendor,
             COALESCE(c.clients, 0)::text AS clients,
             COALESCE(s.sales_count, 0)::text AS sales_count,
             COALESCE(s.sales_total, 0)::text AS sales_total,
             COALESCE(q.quotes_count, 0)::text AS quotes_count,
             COALESCE(q.accepted_quotes, 0)::text AS accepted_quotes,
             COALESCE(g.goal_sales, 0)::text AS goal_sales,
             COALESCE(g.goal_clients, 0)::text AS goal_clients
      FROM vendors v
      LEFT JOIN clients c ON c.vendor = v.vendor
      LEFT JOIN sales s ON s.vendor = v.vendor
      LEFT JOIN quotes q ON q.vendor = v.vendor
      LEFT JOIN goals g ON g.vendor = v.vendor
      WHERE COALESCE(v.vendor, '') <> ''
      ORDER BY v.vendor ASC
    `,
    [companyId],
  );

  const vendors = result.rows.map((row) => {
    const quotes = Number(row.quotes_count);
    const accepted = Number(row.accepted_quotes);
    return {
      vendor: row.vendor,
      clients: Number(row.clients),
      salesCount: Number(row.sales_count),
      salesTotal: Number(row.sales_total),
      quotes,
      acceptedQuotes: accepted,
      closeRate: quotes > 0 ? (accepted / quotes) * 100 : 0,
      goalSales: Number(row.goal_sales),
      goalClients: Number(row.goal_clients),
    };
  });

  return {
    vendors,
    meta: {
      count: vendors.length,
      clients: vendors.reduce((sum, item) => sum + item.clients, 0),
      salesTotal: vendors.reduce((sum, item) => sum + item.salesTotal, 0),
    },
  };
}
