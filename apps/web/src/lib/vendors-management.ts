import { queryWithCompanyContext } from "@/lib/db";

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
        SELECT trim(nombre || ' ' || apellido) AS vendor
        FROM operadores
        WHERE empresa_id = $1
        UNION
        SELECT vendedor_cl AS vendor FROM clientes WHERE empresa_id = $1 AND COALESCE(vendedor_cl, '') <> ''
        UNION
        SELECT vendedor AS vendor FROM ventas WHERE empresa_id = $1 AND COALESCE(vendedor, '') <> ''
        UNION
        SELECT creado_por AS vendor FROM presupuestos WHERE empresa_id = $1 AND COALESCE(creado_por, '') <> ''
      ),
      clients AS (
        SELECT vendedor_cl AS vendor, COUNT(*) AS clients
        FROM clientes
        WHERE empresa_id = $1 AND COALESCE(vendedor_cl, '') <> ''
        GROUP BY vendedor_cl
      ),
      sales AS (
        SELECT vendedor AS vendor, COUNT(*) AS sales_count, COALESCE(SUM(monto), 0) AS sales_total
        FROM ventas
        WHERE empresa_id = $1
          AND COALESCE(vendedor, '') <> ''
          AND fecha >= date_trunc('month', CURRENT_DATE)::date
          AND fecha < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
        GROUP BY vendedor
      ),
      quotes AS (
        SELECT creado_por AS vendor,
               COUNT(*) AS quotes_count,
               COUNT(*) FILTER (WHERE estado = 'aceptada') AS accepted_quotes
        FROM presupuestos
        WHERE empresa_id = $1 AND COALESCE(creado_por, '') <> ''
        GROUP BY creado_por
      ),
      goals AS (
        SELECT vendedor AS vendor, meta_ventas, meta_clientes
        FROM app_vendedor_metas
        WHERE empresa_id = $1
          AND periodo = date_trunc('month', CURRENT_DATE)::date
      )
      SELECT v.vendor,
             COALESCE(c.clients, 0)::text AS clients,
             COALESCE(s.sales_count, 0)::text AS sales_count,
             COALESCE(s.sales_total, 0)::text AS sales_total,
             COALESCE(q.quotes_count, 0)::text AS quotes_count,
             COALESCE(q.accepted_quotes, 0)::text AS accepted_quotes,
             COALESCE(g.meta_ventas, 0)::text AS goal_sales,
             COALESCE(g.meta_clientes, 0)::text AS goal_clients
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
