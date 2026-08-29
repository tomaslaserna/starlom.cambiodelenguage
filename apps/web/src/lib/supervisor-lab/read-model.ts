import type { AuthSession } from "@/lib/auth";
import { isStaffRole, normalizeRole } from "@/lib/auth";
import { hasAllCustomerAccess, sellerCandidates } from "@/lib/crm";
import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { currentMonth, monthRange } from "@/lib/month-range";
import { netSalesAmountSql } from "@/lib/sales-vat";
import { activeAccountMovementWhereSql } from "@/lib/accounts";

export type SupervisorPurchaseItem = {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type SupervisorPurchase = {
  saleId: string;
  saleNumber: string;
  date: string;
  total: number;
  items: SupervisorPurchaseItem[];
};

export type SupervisorCustomerHistory = {
  customerId: string;
  customerName: string;
  seller: string;
  purchases: SupervisorPurchase[];
};

export type SupervisorCustomerMatch = {
  customerId: string;
  customerName: string;
  taxId: string;
  seller: string;
  sourceHref: string;
};

export type SupervisorCatalogRecommendation = {
  id: string;
  code: string;
  name: string;
  category: string;
  supplier: string;
  available: number;
  href: string;
};

export async function searchSupervisorCatalogForCleaning(
  session: AuthSession,
  terms: string[],
): Promise<SupervisorCatalogRecommendation[]> {
  assertSupervisorReader(session);
  const patterns = [...new Set(terms.map((term) => term.trim().toLocaleLowerCase("es")).filter(Boolean))]
    .slice(0, 12)
    .map((term) => `%${term.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  if (!patterns.length) return [];
  const result = await queryWithCompanyContext<{
    id: string;
    code: string | null;
    name: string;
    category: string | null;
    supplier: string | null;
    available: string;
  }>(
    session.companyId,
    `SELECT p.id::text AS id,
            p.sku AS code,
            p.name,
            p.category,
            s.display_name AS supplier,
            COALESCE(stock.available, 0)::text AS available
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
       LEFT JOIN LATERAL (
         SELECT SUM(CASE WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity ELSE -sm.quantity END) AS available
           FROM stock_movements sm
          WHERE sm.empresa_id = p.empresa_id AND sm.product_id = p.id
       ) stock ON TRUE
      WHERE p.empresa_id = $1
        AND p.active = TRUE
        AND (
          LOWER(COALESCE(p.name, '')) LIKE ANY($2::text[])
          OR LOWER(COALESCE(p.category, '')) LIKE ANY($2::text[])
          OR LOWER(COALESCE(p.sku, '')) LIKE ANY($2::text[])
        )
      ORDER BY
        CASE WHEN COALESCE(stock.available, 0) > 0 THEN 0 ELSE 1 END,
        p.name ASC
      LIMIT 12`,
    [session.companyId, patterns],
    { cache: false },
  );
  return result.rows.map((row) => ({
    id: row.id,
    code: row.code ?? "",
    name: row.name,
    category: row.category ?? "",
    supplier: row.supplier ?? "",
    available: Number(row.available),
    href: `/products?query=${encodeURIComponent(row.code || row.name)}`,
  }));
}

export type SupervisorCustomerBalance = {
  customerId: string;
  customerName: string;
  taxId: string;
  seller: string;
  debit: number;
  credit: number;
  balance: number;
  lastMovementDate: string | null;
  sourceHref: string;
};

export type SupervisorFiscalInvoice = {
  saleId: string;
  customerId: string;
  customerName: string;
  type: string;
  number: string;
  issueDate: string;
  total: number;
  cae: string;
  caeExpiresAt: string | null;
  pdfHref: string;
  accountHref: string;
};

function fiscalInvoiceTypeLabel(receiptType: number) {
  if (receiptType === 1) return "Factura A";
  if (receiptType === 6) return "Factura B";
  if (receiptType === 11) return "Factura C";
  return `Factura (${receiptType})`;
}

function fiscalInvoiceNumber(pointOfSale: number, receiptNumber: number) {
  return `${String(pointOfSale).padStart(4, "0")}-${String(receiptNumber).padStart(8, "0")}`;
}

function mapSupervisorInvoice(row: {
  sale_id: string;
  customer_id: string;
  customer_name: string;
  fiscal_receipt_type: number;
  fiscal_point_of_sale: number;
  fiscal_receipt_number: number;
  issue_date: string;
  total: string;
  cae: string;
  cae_expires_at: string | null;
}): SupervisorFiscalInvoice {
  return {
    saleId: row.sale_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    type: fiscalInvoiceTypeLabel(Number(row.fiscal_receipt_type)),
    number: fiscalInvoiceNumber(Number(row.fiscal_point_of_sale), Number(row.fiscal_receipt_number)),
    issueDate: row.issue_date,
    total: Number(row.total),
    cae: row.cae,
    caeExpiresAt: row.cae_expires_at,
    pdfHref: `/api/pdfs/fiscal/sales/${row.sale_id}`,
    accountHref: `/payments/accounts/${row.customer_id}`,
  };
}

export type SupervisorOperationalSnapshot = {
  orders: Array<{
    id: string;
    number: string;
    customerName: string;
    status: "pending_approval" | "authorized";
    deliveryDate: string | null;
  }>;
  sales: Array<{
    id: string;
    number: string;
    customerName: string;
    saleDate: string;
    status: "delivered";
    fiscalDecision: "pending";
  }>;
};

export type SupervisorSalesMetrics = {
  period: string;
  saleCount: number;
  grossAmount: number;
  netAmount: number;
  adjustmentAmount: number;
  sourceHref: string;
};

function assertSupervisorReader(session: AuthSession) {
  if (!isStaffRole(session.role)) throw new Error("SUPERVISOR_FORBIDDEN");
}

async function sellerScope(session: AuthSession, alias: string, firstParam: number) {
  if (normalizeRole(session.role) !== "vendedor") return { sql: "", params: [] as unknown[] };
  if (await hasAllCustomerAccess(session)) return { sql: "", params: [] as unknown[] };
  return {
    sql: `AND (
      UPPER(BTRIM(COALESCE(${alias}.seller_name, ''))) = ANY($${firstParam}::text[])
      OR UPPER(BTRIM(COALESCE(c.assigned_seller, ''))) = ANY($${firstParam}::text[])
    )`,
    params: [sellerCandidates(session)],
  };
}

export async function getSupervisorCustomerHistory(
  session: AuthSession,
  customerId: string,
): Promise<SupervisorCustomerHistory | null> {
  assertSupervisorReader(session);
  const scope = await sellerScope(session, "c", 3);
  const result = await queryWithCompanyContext<{
    customer_id: string;
    customer_name: string;
    seller: string;
    sale_id: string | null;
    sale_number: string;
    sale_date: string | null;
    total: string;
    product_id: string | null;
    product_name: string | null;
    quantity: string | null;
    unit_price: string | null;
  }>(
    session.companyId,
    `
      SELECT c.id::text AS customer_id,
             c.display_name AS customer_name,
             COALESCE(c.seller_name, '') AS seller,
             s.id::text AS sale_id,
             COALESCE(NULLIF(s.sale_number, ''), 'P-' || COALESCE(s.commercial_number::text, '')) AS sale_number,
             s.sale_date::text AS sale_date,
             COALESCE(s.total_amount, 0)::text AS total,
             si.product_id::text AS product_id,
             COALESCE(si.description, p.name) AS product_name,
             si.quantity::text AS quantity,
             si.unit_price::text AS unit_price
        FROM clients c
        LEFT JOIN sales s
          ON s.client_id = c.id
         AND s.empresa_id = c.empresa_id
         AND ${normalizedOrderStatusSql("s")} = 'entregado'
         AND ${canonicalSalesSourceSql("s")}
        LEFT JOIN sale_items si
          ON si.sale_id = s.id
         AND si.empresa_id = s.empresa_id
        LEFT JOIN products p
          ON p.id = si.product_id
         AND p.empresa_id = si.empresa_id
       WHERE c.id = $1::uuid
         AND c.empresa_id = $2
         ${scope.sql}
       ORDER BY s.sale_date ASC, s.id ASC, si.id ASC
    `,
    [customerId, session.companyId, ...scope.params],
    { cache: false },
  );

  const first = result.rows[0];
  if (!first) return null;
  const purchases = new Map<string, SupervisorPurchase>();
  for (const row of result.rows) {
    if (!row.sale_id || !row.sale_date) continue;
    const purchase = purchases.get(row.sale_id) ?? {
      saleId: row.sale_id,
      saleNumber: row.sale_number,
      date: row.sale_date,
      total: Number(row.total),
      items: [],
    };
    if (row.product_name) {
      purchase.items.push({
        productId: row.product_id,
        name: row.product_name,
        quantity: Number(row.quantity ?? 0),
        unitPrice: Number(row.unit_price ?? 0),
      });
    }
    purchases.set(row.sale_id, purchase);
  }

  return {
    customerId: first.customer_id,
    customerName: first.customer_name,
    seller: first.seller,
    purchases: [...purchases.values()],
  };
}

export async function searchSupervisorCustomers(
  session: AuthSession,
  search: string,
  limit = 8,
): Promise<SupervisorCustomerMatch[]> {
  assertSupervisorReader(session);
  const term = search.trim();
  if (term.length < 2) return [];
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
  const scope = await sellerScope(session, "c", 4);
  const result = await queryWithCompanyContext<{
    id: string;
    display_name: string;
    tax_id: string;
    seller_name: string;
  }>(
    session.companyId,
    `
      SELECT c.id::text AS id,
             c.display_name,
             COALESCE(c.tax_id, '') AS tax_id,
             COALESCE(c.seller_name, c.assigned_seller, '') AS seller_name
        FROM clients c
       WHERE c.empresa_id = $1
         AND (
           c.display_name ILIKE '%' || $2 || '%'
           OR COALESCE(c.legal_name, '') ILIKE '%' || $2 || '%'
           OR COALESCE(c.tax_id, '') ILIKE '%' || $2 || '%'
         )
         ${scope.sql}
       ORDER BY
         CASE WHEN UPPER(c.display_name) = UPPER($2) THEN 0 ELSE 1 END,
         c.display_name ASC
       LIMIT $3
    `,
    [session.companyId, term, safeLimit, ...scope.params],
    { cache: false },
  );

  return result.rows.map((row) => ({
    customerId: row.id,
    customerName: row.display_name,
    taxId: row.tax_id,
    seller: row.seller_name,
    sourceHref: `/customers/${row.id}`,
  }));
}

export async function getSupervisorCustomerBalances(
  session: AuthSession,
  search: string,
  limit = 5,
): Promise<SupervisorCustomerBalance[]> {
  assertSupervisorReader(session);
  const term = search.trim();
  if (term.length < 2) return [];
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 10);
  const scope = await sellerScope(session, "c", 4);
  const activeMovement = activeAccountMovementWhereSql("m", "s");
  const result = await queryWithCompanyContext<{
    id: string;
    display_name: string;
    tax_id: string;
    seller_name: string;
    total_debit: string;
    total_credit: string;
    last_movement: string | null;
  }>(
    session.companyId,
    `
      SELECT c.id::text AS id,
             c.display_name,
             COALESCE(c.tax_id, '') AS tax_id,
             COALESCE(c.seller_name, c.assigned_seller, '') AS seller_name,
             COALESCE(SUM(m.debit) FILTER (WHERE ${activeMovement}), 0)::text AS total_debit,
             COALESCE(SUM(m.credit) FILTER (WHERE ${activeMovement}), 0)::text AS total_credit,
             MAX(m.movement_date) FILTER (WHERE ${activeMovement})::text AS last_movement
        FROM clients c
        LEFT JOIN current_account_movements m
          ON m.client_id = c.id
         AND m.empresa_id = c.empresa_id
         AND m.entity_type = 'cliente'
        LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
       WHERE c.empresa_id = $1
         AND (
           c.display_name ILIKE '%' || $2 || '%'
           OR COALESCE(c.legal_name, '') ILIKE '%' || $2 || '%'
           OR COALESCE(c.tax_id, '') ILIKE '%' || $2 || '%'
         )
         ${scope.sql}
       GROUP BY c.id, c.display_name, c.tax_id, c.seller_name, c.assigned_seller
       ORDER BY CASE WHEN UPPER(c.display_name) = UPPER($2) THEN 0 ELSE 1 END, c.display_name ASC
       LIMIT $3
    `,
    [session.companyId, term, safeLimit, ...scope.params],
    { cache: false },
  );

  return result.rows.map((row) => {
    const debit = Number(row.total_debit);
    const credit = Number(row.total_credit);
    return {
      customerId: row.id,
      customerName: row.display_name,
      taxId: row.tax_id,
      seller: row.seller_name,
      debit,
      credit,
      balance: Math.round((debit - credit) * 100) / 100,
      lastMovementDate: row.last_movement,
      sourceHref: `/payments/accounts/${row.id}`,
    };
  });
}

export async function getSupervisorCustomerInvoices(
  session: AuthSession,
  search: string,
  limit = 3,
): Promise<SupervisorFiscalInvoice[]> {
  assertSupervisorReader(session);
  const term = search.trim();
  if (term.length < 2) return [];
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 10);
  const scope = await sellerScope(session, "c", 4);
  const result = await queryWithCompanyContext<{
    sale_id: string; customer_id: string; customer_name: string; fiscal_receipt_type: number;
    fiscal_point_of_sale: number; fiscal_receipt_number: number; issue_date: string;
    total: string; cae: string; cae_expires_at: string | null;
  }>(
    session.companyId,
    `
      SELECT s.id::text AS sale_id,
             c.id::text AS customer_id,
             c.display_name AS customer_name,
             s.fiscal_receipt_type,
             s.fiscal_point_of_sale,
             s.fiscal_receipt_number,
             COALESCE(s.fiscal_issue_date, (s.fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, s.sale_date)::text AS issue_date,
             COALESCE(s.total_amount, 0)::text AS total,
             s.cae,
             s.cae_expires_at::text
        FROM sales s
        JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
       WHERE s.empresa_id = $1
         AND COALESCE(s.fiscal_status, 'no_enviado') = 'aprobado'
         AND COALESCE(s.cae, '') NOT IN ('', 'manual')
         AND s.fiscal_receipt_type IN (1, 6, 11)
         AND s.fiscal_point_of_sale IS NOT NULL
         AND s.fiscal_receipt_number IS NOT NULL
         AND (
           c.display_name ILIKE '%' || $2 || '%'
           OR COALESCE(c.legal_name, '') ILIKE '%' || $2 || '%'
           OR COALESCE(c.tax_id, '') ILIKE '%' || $2 || '%'
         )
         ${scope.sql}
       ORDER BY issue_date DESC, s.fiscal_receipt_number DESC
       LIMIT $3
    `,
    [session.companyId, term, safeLimit, ...scope.params],
    { cache: false },
  );
  return result.rows.map(mapSupervisorInvoice);
}

export async function getSupervisorInvoiceByNumber(
  session: AuthSession,
  requestedNumber: string,
): Promise<SupervisorFiscalInvoice[]> {
  assertSupervisorReader(session);
  const numericParts = requestedNumber.match(/\d+/g) ?? [];
  const receiptNumber = Number(numericParts.at(-1));
  const pointOfSale = numericParts.length > 1 ? Number(numericParts.at(-2)) : null;
  if (!Number.isSafeInteger(receiptNumber) || receiptNumber <= 0) return [];
  const scope = await sellerScope(session, "c", 4);
  const result = await queryWithCompanyContext<{
    sale_id: string; customer_id: string; customer_name: string; fiscal_receipt_type: number;
    fiscal_point_of_sale: number; fiscal_receipt_number: number; issue_date: string;
    total: string; cae: string; cae_expires_at: string | null;
  }>(
    session.companyId,
    `
      SELECT s.id::text AS sale_id,
             c.id::text AS customer_id,
             c.display_name AS customer_name,
             s.fiscal_receipt_type,
             s.fiscal_point_of_sale,
             s.fiscal_receipt_number,
             COALESCE(s.fiscal_issue_date, (s.fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, s.sale_date)::text AS issue_date,
             COALESCE(s.total_amount, 0)::text AS total,
             s.cae,
             s.cae_expires_at::text
        FROM sales s
        JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
       WHERE s.empresa_id = $1
         AND COALESCE(s.fiscal_status, 'no_enviado') = 'aprobado'
         AND COALESCE(s.cae, '') NOT IN ('', 'manual')
         AND s.fiscal_receipt_type IN (1, 6, 11)
         AND s.fiscal_receipt_number = $2
         AND ($3::integer IS NULL OR s.fiscal_point_of_sale = $3)
         ${scope.sql}
       ORDER BY s.fiscal_point_of_sale DESC, s.fiscal_receipt_type ASC
       LIMIT 10
    `,
    [session.companyId, receiptNumber, pointOfSale, ...scope.params],
    { cache: false },
  );
  return result.rows.map(mapSupervisorInvoice);
}

export async function getSupervisorOperationalSnapshot(
  session: AuthSession,
): Promise<SupervisorOperationalSnapshot> {
  assertSupervisorReader(session);
  const scope = await sellerScope(session, "s", 2);
  const result = await queryWithCompanyContext<{
    id: string;
    number: string;
    customer_name: string;
    sale_date: string;
    delivery_date: string | null;
    order_status: string;
    fiscal_status: string;
    has_pending_fiscal_request: boolean;
  }>(
    session.companyId,
    `
      SELECT s.id::text,
             COALESCE(NULLIF(s.sale_number, ''), 'P-' || COALESCE(s.commercial_number::text, '')) AS number,
             COALESCE(c.display_name, 'Cliente sin identificar') AS customer_name,
             s.sale_date::text AS sale_date,
             COALESCE(dd.delivery_date, s.sale_date)::text AS delivery_date,
             ${normalizedOrderStatusSql("s")} AS order_status,
             COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
             EXISTS (
               SELECT 1
                 FROM app_solicitudes request
                WHERE request.empresa_id = s.empresa_id
                  AND request.estado = 'pendiente'
                  AND request.metadata->>'action' = 'fiscal_invoice'
                  AND request.metadata->>'saleId' = s.id::text
             ) AS has_pending_fiscal_request
        FROM sales s
        LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        LEFT JOIN delivery_documents dd ON dd.sale_id = s.id AND dd.empresa_id = s.empresa_id
       WHERE s.empresa_id = $1
         AND ${canonicalSalesSourceSql("s")}
         ${scope.sql}
       ORDER BY s.sale_date DESC, s.created_at DESC
       LIMIT 500
    `,
    [session.companyId, ...scope.params],
    { cache: false },
  );

  const snapshot: SupervisorOperationalSnapshot = { orders: [], sales: [] };
  for (const row of result.rows) {
    if (row.order_status === "cargado") {
      snapshot.orders.push({
        id: row.id,
        number: row.number,
        customerName: row.customer_name,
        status: "pending_approval",
        deliveryDate: row.delivery_date,
      });
    } else if (row.order_status === "confirmado") {
      snapshot.orders.push({
        id: row.id,
        number: row.number,
        customerName: row.customer_name,
        status: "authorized",
        deliveryDate: row.delivery_date,
      });
    } else if (row.order_status === "entregado") {
      const fiscalDecisionHandled =
        row.fiscal_status === "aprobado" || row.has_pending_fiscal_request;
      if (!fiscalDecisionHandled) {
        snapshot.sales.push({
          id: row.id,
          number: row.number,
          customerName: row.customer_name,
          saleDate: row.sale_date,
          status: "delivered",
          fiscalDecision: "pending",
        });
      }
    }
  }
  return snapshot;
}

export async function getSupervisorSalesMetrics(
  session: AuthSession,
  requestedPeriod = currentMonth(),
): Promise<SupervisorSalesMetrics> {
  assertSupervisorReader(session);
  const range = monthRange(requestedPeriod);
  const scope = await sellerScope(session, "s", 4);
  const result = await queryWithCompanyContext<{
    sale_count: string;
    gross_amount: string;
    net_amount: string;
    adjustment_amount: string;
  }>(
    session.companyId,
    `
      WITH delivered_sales AS (
        SELECT s.id,
               COALESCE(s.total_amount, 0) AS gross_amount,
               ${netSalesAmountSql("COALESCE(s.total_amount, 0)", "s")} AS net_amount
          FROM sales s
          LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
         WHERE s.empresa_id = $1
           AND s.sale_date >= $2::date
           AND s.sale_date < $3::date
           AND ${canonicalSalesSourceSql("s")}
           AND ${normalizedOrderStatusSql("s")} = 'entregado'
           ${scope.sql}
      ), adjustments AS (
        SELECT COALESCE(SUM(CASE WHEN sid.class_name = 'ND' THEN sid.amount ELSE -sid.amount END), 0) AS amount
          FROM sales_internal_documents sid
          JOIN sales s ON s.id = sid.sale_id AND s.empresa_id = sid.empresa_id
          LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
         WHERE sid.empresa_id = $1
           AND sid.issue_date >= $2::date
           AND sid.issue_date < $3::date
           AND (sid.fiscal = false OR sid.operational_document_id IS NULL)
           AND ${canonicalSalesSourceSql("s")}
           AND ${normalizedOrderStatusSql("s")} = 'entregado'
           ${scope.sql}
      )
      SELECT COUNT(*)::text AS sale_count,
             (COALESCE(SUM(ds.gross_amount), 0) + a.amount)::text AS gross_amount,
             (COALESCE(SUM(ds.net_amount), 0) + a.amount)::text AS net_amount,
             a.amount::text AS adjustment_amount
        FROM delivered_sales ds
        CROSS JOIN adjustments a
       GROUP BY a.amount
    `,
    [session.companyId, range.start, range.endExclusive, ...scope.params],
    { cache: false },
  );
  const row = result.rows[0];
  return {
    period: range.month,
    saleCount: Number(row?.sale_count ?? 0),
    grossAmount: Number(row?.gross_amount ?? 0),
    netAmount: Number(row?.net_amount ?? 0),
    adjustmentAmount: Number(row?.adjustment_amount ?? 0),
    sourceHref: `/sales?month=${range.month}`,
  };
}
