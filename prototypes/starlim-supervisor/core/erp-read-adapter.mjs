import { assertReadOnlySql } from "./read-only-guard.mjs";
import { canonicalRole, visibleCustomerScope } from "./permissions.mjs";

export function createErpReadAdapter(query) {
  if (typeof query !== "function") throw new TypeError("Se requiere una función query de servidor.");

  async function run(companyId, sql, params) {
    const safeSql = assertReadOnlySql(sql);
    const result = await query({ companyId, sql: safeSql, params });
    return Array.isArray(result) ? result : result.rows;
  }

  return {
    async customerHistory(session, customerId) {
      const scope = visibleCustomerScope(session);
      if (scope.kind === "none") return null;
      const sellerClause = scope.kind === "seller"
        ? "AND (UPPER(BTRIM(COALESCE(c.seller_name,''))) = ANY($3::text[]) OR UPPER(BTRIM(COALESCE(c.assigned_seller,''))) = ANY($3::text[]))"
        : "";
      const params = scope.kind === "seller"
        ? [String(customerId), Number(session.companyId), scope.sellerNames]
        : [String(customerId), Number(session.companyId)];

      const rows = await run(session.companyId, `
        SELECT c.id::text AS customer_id,
               c.display_name AS customer_name,
               COALESCE(c.seller_name, '') AS seller,
               s.id::text AS sale_id,
               s.sale_date::text AS sale_date,
               si.product_id::text AS product_id,
               COALESCE(si.description, p.name, '(producto eliminado)') AS product_name,
               si.quantity::text AS quantity
          FROM clients c
          LEFT JOIN sales s
            ON s.client_id = c.id
           AND s.empresa_id = c.empresa_id
           AND COALESCE(s.order_status, s.status, 'cargado') = 'entregado'
          LEFT JOIN sale_items si
            ON si.sale_id = s.id
           AND si.empresa_id = s.empresa_id
          LEFT JOIN products p
            ON p.id = si.product_id
           AND p.empresa_id = si.empresa_id
         WHERE c.id = $1::uuid
           AND c.empresa_id = $2
           ${sellerClause}
         ORDER BY s.sale_date ASC, s.id ASC, si.id ASC
      `, params);
      if (!rows.length) return null;
      return groupCustomerHistory(rows);
    },

    async operationalSnapshot(session) {
      const role = canonicalRole(session.role);
      const scope = visibleCustomerScope(session);
      if (scope.kind === "none") return { orders: [], sales: [], existingReminderKeys: [] };
      const sellerClause = scope.kind === "seller"
        ? "AND (UPPER(BTRIM(COALESCE(s.seller_name,''))) = ANY($2::text[]) OR UPPER(BTRIM(COALESCE(c.assigned_seller,''))) = ANY($2::text[]))"
        : "";
      const params = scope.kind === "seller" ? [Number(session.companyId), scope.sellerNames] : [Number(session.companyId)];
      const rows = await run(session.companyId, `
        SELECT s.id::text,
               COALESCE(NULLIF(s.sale_number, ''), 'P-' || COALESCE(s.commercial_number::text, '')) AS number,
               s.sale_date::text AS sale_date,
               s.delivery_date::text AS delivery_date,
               COALESCE(s.order_status, s.status, 'cargado') AS order_status,
               COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
               EXISTS (
                 SELECT 1 FROM app_solicitudes req
                  WHERE req.empresa_id = s.empresa_id
                    AND req.estado = 'pendiente'
                    AND req.metadata->>'action' = 'fiscal_invoice'
                    AND req.metadata->>'saleId' = s.id::text
               ) AS has_pending_fiscal_request
          FROM sales s
          LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
         WHERE s.empresa_id = $1
           ${sellerClause}
         ORDER BY s.sale_date DESC, s.created_at DESC
         LIMIT 500
      `, params);
      return mapOperationalSnapshot(rows, role);
    },
  };
}

export function groupCustomerHistory(rows) {
  const first = rows[0];
  const sales = new Map();
  for (const row of rows) {
    if (!row.sale_id || !row.sale_date) continue;
    const sale = sales.get(row.sale_id) ?? { id: row.sale_id, date: row.sale_date, items: [] };
    if (row.product_name) {
      sale.items.push({ productId: row.product_id || null, name: row.product_name, quantity: Number(row.quantity ?? 0) });
    }
    sales.set(row.sale_id, sale);
  }
  return {
    id: first.customer_id,
    name: first.customer_name,
    seller: first.seller,
    purchases: [...sales.values()],
  };
}

export function mapOperationalSnapshot(rows, role) {
  const orders = [];
  const sales = [];
  for (const row of rows) {
    const status = String(row.order_status ?? "");
    if (status === "cargado") orders.push({ id: row.id, number: row.number, status: "pending_approval", deliveryDate: row.delivery_date });
    if (status === "confirmado") orders.push({ id: row.id, number: row.number, status: "authorized", deliveryDate: row.delivery_date });
    if (status === "entregado") {
      sales.push({
        id: row.id,
        number: row.number,
        saleDate: row.sale_date,
        status: "delivered",
        fiscalDecision: row.fiscal_status === "aprobado" || row.has_pending_fiscal_request ? "handled" : "pending",
      });
    }
  }
  return { role, orders, sales, existingReminderKeys: [] };
}
