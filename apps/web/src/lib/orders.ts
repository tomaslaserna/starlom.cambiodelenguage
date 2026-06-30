import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { lineSubtotal, money, normalizePriceListKey, type PriceListKey } from "@/lib/order-pricing";
import { parsePagination } from "@/lib/pagination";
import { priceSqlExpression, productMarginCodeExpression } from "@/lib/product-pricing-sql";
import {
  type OrderStatus,
  isOrderStatus,
  normalizeOrderStatusValue,
  normalizedOrderStatusSql,
} from "@/lib/order-status";
import {
  invoiceDocumentForFiscalCondition,
  normalizeDesiredDocument,
  normalizeOrderCreationDocument,
  receiptAddsVat,
  receiptTypeCode,
} from "@/lib/receipt-types";
import { textField, uuidParam, type RequestBody } from "@/lib/request-body";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { discountSaleStockIfAvailable } from "@/lib/stock";
import type { AuthSession } from "@/lib/auth";
import type { PoolClient } from "pg";

type ListInput = {
  companyId?: number;
  query?: string | null;
  status?: string | null;
  collectionStatus?: string | null;
  page?: string | null;
  pageSize?: string | null;
};

export type OrderSummary = {
  id: string;
  customerId: string | null;
  customerName: string;
  customerDocument: string;
  customerFiscalCondition: string;
  priceList: string;
  amount: number;
  collectedAmount: number;
  outstandingAmount: number;
  netAmount: number;
  vatAmount: number;
  receiptNumber: number;
  paymentCondition: string;
  date: string | null;
  seller: string;
  collectionStatus: string;
  orderStatus: string;
  desiredDocument: string;
  stockDiscounted: boolean;
  observation: string;
};

export type OrderDetailLine = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
};

export type OrderDetail = OrderSummary & {
  lines: OrderDetailLine[];
};

export type OrderFormClient = {
  id: string;
  name: string;
  legalName: string;
  taxId: string;
  fiscalCondition: string;
  phone: string;
  address: string;
  priceList: string;
  receiptType: string;
  seller: string;
  paymentTermDays: number | null;
};

export type OrderFormProduct = {
  id: string;
  code: string;
  name: string;
  available: number;
  prices: Record<PriceListKey, number>;
};

type BasicOrderLineInput = {
  productId: string;
  quantity: number;
  discount: number;
};

const DEFAULT_COMPANY_ID = 1;
const COLLECTION_STATES = ["pendiente", "cancelado"] as const;

function searchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function mapOrder(row: {
  id: string;
  client_id: string | null;
  sale_number: string;
  client_name: string;
  client_document: string;
  fiscal_condition: string;
  price_list_name: string;
  monto: string;
  monto_cobrado: string;
  saldo_pendiente: string;
  monto_neto: string;
  monto_iva: string;
  receipt_number: number | null;
  payment_condition: string;
  fecha: string | null;
  seller: string;
  collection_status: string;
  order_status: string;
  desired_document: string;
  stock_discounted: boolean;
  notes: string;
}): OrderSummary {
  return {
    id: row.id,
    customerId: row.client_id,
    customerName: row.client_name,
    customerDocument: row.client_document,
    customerFiscalCondition: row.fiscal_condition,
    priceList: row.price_list_name,
    amount: Number(row.monto),
    collectedAmount: Number(row.monto_cobrado),
    outstandingAmount: Number(row.saldo_pendiente),
    netAmount: Number(row.monto_neto),
    vatAmount: Number(row.monto_iva),
    receiptNumber: row.receipt_number ?? (Number(row.sale_number.replace(/\D/g, "")) || 0),
    paymentCondition: row.payment_condition,
    date: row.fecha,
    seller: row.seller,
    collectionStatus: row.collection_status,
    orderStatus: normalizeOrderStatus(row.order_status),
    desiredDocument: row.desired_document,
    stockDiscounted: row.stock_discounted,
    observation: row.notes,
  };
}

function normalizeOrderStatus(status: string) {
  return normalizeOrderStatusValue(status);
}

async function insertIntegrationEvent(
  companyId: number,
  type: string,
  payload: Record<string, unknown>,
) {
  await queryWithCompanyContext(
    companyId,
    "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
    [type, JSON.stringify(payload), companyId],
  );
}

export async function listOrders(input: ListInput = {}) {
  const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
  const query = input.query?.trim() ?? "";
  const status = input.status?.trim() ?? "";
  const collectionStatus = input.collectionStatus?.trim() ?? "";
  const pagination = parsePagination(input);
  const params: unknown[] = [companyId];
  const filters = ["s.empresa_id = $1", canonicalSalesSourceSql("s")];

  if (query) {
    params.push(searchPattern(query));
    filters.push(
      `(COALESCE(s.client_name, '') ILIKE $${params.length} ESCAPE '\\' OR COALESCE(s.client_document, '') ILIKE $${params.length} ESCAPE '\\' OR COALESCE(s.seller_name, '') ILIKE $${params.length} ESCAPE '\\' OR COALESCE(s.sale_number, '') ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  if (status) {
    params.push(status);
    filters.push(`${normalizedOrderStatusSql("s")} = $${params.length}`);
  }

  if (collectionStatus) {
    params.push(collectionStatus);
    filters.push(`COALESCE(collection_status, 'pendiente') = $${params.length}`);
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM sales s WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<Parameters<typeof mapOrder>[0]>(
    companyId,
    `
      SELECT s.id::text AS id, s.client_id::text AS client_id, COALESCE(s.sale_number, '') AS sale_number,
             COALESCE(s.client_name, c.display_name, '') AS client_name,
             COALESCE(s.client_document, c.tax_id, '') AS client_document,
             COALESCE(c.fiscal_condition, '') AS fiscal_condition,
             COALESCE(s.price_list_name, c.price_list_name, '') AS price_list_name,
             COALESCE(s.total_amount, 0)::text AS monto,
             COALESCE(collections.total_credit, 0)::text AS monto_cobrado,
             GREATEST(COALESCE(s.total_amount, 0) - COALESCE(collections.total_credit, 0), 0)::text AS saldo_pendiente,
             CASE
               WHEN COALESCE(s.desired_document, '') IN ('factura_a','factura_b') OR COALESCE(s.receipt_type, 0) IN (1,6)
                 THEN ROUND(COALESCE(s.total_amount, 0) / 1.21, 2)
               ELSE COALESCE(s.total_amount, 0)
             END::text AS monto_neto,
             GREATEST(
               COALESCE(s.total_amount, 0) - CASE
                 WHEN COALESCE(s.desired_document, '') IN ('factura_a','factura_b') OR COALESCE(s.receipt_type, 0) IN (1,6)
                   THEN ROUND(COALESCE(s.total_amount, 0) / 1.21, 2)
                 ELSE COALESCE(s.total_amount, 0)
               END,
               0
             )::text AS monto_iva,
             s.receipt_number,
             COALESCE(s.payment_condition, '') AS payment_condition,
             s.sale_date::text AS fecha,
             COALESCE(s.seller_name, c.seller_name, '') AS seller,
             COALESCE(s.collection_status, 'pendiente') AS collection_status,
             ${normalizedOrderStatusSql("s")} AS order_status,
             COALESCE(s.desired_document, 'remito') AS desired_document,
             s.stock_discounted,
             COALESCE(s.notes, '') AS notes
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cam.credit), 0) AS total_credit
        FROM current_account_movements cam
        WHERE cam.empresa_id = s.empresa_id AND cam.sale_id = s.id
      ) collections ON true
      WHERE ${where}
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

  return {
    data: rows.rows.map(mapOrder),
    meta: {
      companyId,
      query,
      status,
      collectionStatus,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}

export async function getOrdersDashboard(companyId: number) {
  const result = await queryWithCompanyContext<{
    loaded_month: string;
    confirmed: string;
    delivered_month: string;
    total_month: string;
  }>(
    companyId,
    `
      SELECT
        COUNT(*) FILTER (
          WHERE sale_date >= date_trunc('month', CURRENT_DATE)::date
            AND sale_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
            AND ${normalizedOrderStatusSql("s")} = 'cargado'
        )::text AS loaded_month,
        COUNT(*) FILTER (WHERE ${normalizedOrderStatusSql("s")} = 'confirmado')::text AS confirmed,
        COUNT(*) FILTER (
          WHERE sale_date >= date_trunc('month', CURRENT_DATE)::date
            AND sale_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
            AND ${normalizedOrderStatusSql("s")} = 'entregado'
        )::text AS delivered_month,
        COALESCE(SUM(s.total_amount) FILTER (
          WHERE s.sale_date >= date_trunc('month', CURRENT_DATE)::date
            AND s.sale_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
            AND ${normalizedOrderStatusSql("s")} = 'entregado'
        ), 0)::text AS total_month
      FROM sales s
      WHERE s.empresa_id = $1
        AND ${canonicalSalesSourceSql("s")}
    `,
    [companyId],
  );

  const row = result.rows[0];
  return {
    loadedMonth: Number(row?.loaded_month ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
    deliveredMonth: Number(row?.delivered_month ?? 0),
    totalMonth: Number(row?.total_month ?? 0),
  };
}

export async function getOrder(companyId: number, id: string): Promise<OrderDetail> {
  const orderResult = await queryWithCompanyContext<Parameters<typeof mapOrder>[0]>(
    companyId,
    `
      SELECT s.id::text AS id, s.client_id::text AS client_id, COALESCE(s.sale_number, '') AS sale_number,
             COALESCE(s.client_name, c.display_name, '') AS client_name,
             COALESCE(s.client_document, c.tax_id, '') AS client_document,
             COALESCE(c.fiscal_condition, '') AS fiscal_condition,
             COALESCE(s.price_list_name, c.price_list_name, '') AS price_list_name,
             COALESCE(s.total_amount, 0)::text AS monto,
             COALESCE(collections.total_credit, 0)::text AS monto_cobrado,
             GREATEST(COALESCE(s.total_amount, 0) - COALESCE(collections.total_credit, 0), 0)::text AS saldo_pendiente,
             CASE
               WHEN COALESCE(s.desired_document, '') IN ('factura_a','factura_b') OR COALESCE(s.receipt_type, 0) IN (1,6)
                 THEN ROUND(COALESCE(s.total_amount, 0) / 1.21, 2)
               ELSE COALESCE(s.total_amount, 0)
             END::text AS monto_neto,
             GREATEST(
               COALESCE(s.total_amount, 0) - CASE
                 WHEN COALESCE(s.desired_document, '') IN ('factura_a','factura_b') OR COALESCE(s.receipt_type, 0) IN (1,6)
                   THEN ROUND(COALESCE(s.total_amount, 0) / 1.21, 2)
                 ELSE COALESCE(s.total_amount, 0)
               END,
               0
             )::text AS monto_iva,
             s.receipt_number,
             COALESCE(s.payment_condition, '') AS payment_condition,
             s.sale_date::text AS fecha,
             COALESCE(s.seller_name, c.seller_name, '') AS seller,
             COALESCE(s.collection_status, 'pendiente') AS collection_status,
             ${normalizedOrderStatusSql("s")} AS order_status,
             COALESCE(s.desired_document, 'remito') AS desired_document,
             s.stock_discounted,
             COALESCE(s.notes, '') AS notes
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cam.credit), 0) AS total_credit
        FROM current_account_movements cam
        WHERE cam.empresa_id = s.empresa_id AND cam.sale_id = s.id
      ) collections ON true
      WHERE s.id = $1::uuid AND s.empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );

  const order = orderResult.rows[0];
  if (!order) throw new ApiError(404, "Pedido no encontrado");

  const linesResult = await queryWithCompanyContext<{
    id: string;
    product_id: string | null;
    nombre: string | null;
    cantidad: string;
    precio_unit: string;
    descuento: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT d.id::text AS id, d.product_id::text,
             COALESCE(d.description, p.name, '(producto eliminado)') AS nombre,
             d.quantity::text AS cantidad,
             d.unit_price::text AS precio_unit,
             COALESCE(d.discount, 0)::text AS descuento,
             d.total_amount::text AS subtotal
      FROM sale_items d
      LEFT JOIN products p ON p.id = d.product_id AND p.empresa_id = d.empresa_id
      WHERE d.sale_id = $1::uuid AND d.empresa_id = $2
      ORDER BY d.id ASC
    `,
    [id, companyId],
  );

  return {
    ...mapOrder(order),
    lines: linesResult.rows.map((line) => ({
      id: line.id,
      productId: line.product_id,
      name: line.nombre ?? "",
      quantity: Number(line.cantidad),
      unitPrice: Number(line.precio_unit),
      discount: Number(line.descuento),
      subtotal: Number(line.subtotal),
    })),
  };
}

export function orderStatusFromBody(body: RequestBody): OrderStatus {
  const state = textField(body, "status") || textField(body, "estado");
  if (!isOrderStatus(state)) throw new ApiError(400, "Estado invalido");
  return state;
}

export function orderConfirmationDocumentFromBody(body: RequestBody) {
  return (
    textField(body, "confirmationDocument") ||
    textField(body, "confirmation_document") ||
    textField(body, "comprobante_confirmacion")
  );
}

function normalizeOrderConfirmationDocument(
  value: string,
  fiscalCondition: string,
  currentDesiredDocument: string,
) {
  const source = value.trim() ? value : currentDesiredDocument;
  const normalized = normalizeDesiredDocument(source);
  if (normalized === "remito" || normalized.startsWith("factura_")) return normalized;
  if (value.trim()) throw new ApiError(400, "Al confirmar solo se permite factura o remito");

  const invoiceDocument = invoiceDocumentForFiscalCondition(fiscalCondition, currentDesiredDocument);
  if (invoiceDocument === "remito") return "remito";
  return invoiceDocument;
}

export function observationFromBody(body: RequestBody) {
  return textField(body, "observation") || textField(body, "observacion");
}

export function collectionStatusFromBody(body: RequestBody) {
  const state = textField(body, "collectionStatus") || textField(body, "estado_cobro");
  if (!COLLECTION_STATES.includes(state as (typeof COLLECTION_STATES)[number])) {
    throw new ApiError(
      400,
      "El cobro se registra desde Cobros y Pagos y se aprueba por administracion",
    );
  }
  return state;
}

function arrayFromJson(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed;
  }
  throw new ApiError(400, `${label} invalido`);
}

function numericItemValue(item: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== "") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new ApiError(400, `${key} debe ser numerico`);
      return numeric;
    }
  }
  return fallback;
}

function fallbackPaymentCondition(paymentTermDays: number | null) {
  return paymentTermDays && paymentTermDays > 0 ? `${paymentTermDays} dias` : "pendiente";
}

type OrderCustomerRow = {
  id: string;
  display_name: string;
  legal_name: string | null;
  tax_id: string | null;
  fiscal_condition: string | null;
  price_list_name: string | null;
  receipt_type: string | null;
  seller_name: string | null;
  payment_term_days: number | null;
};

type ResolvedOrderDetailLine = {
  productId: string;
  description: string;
  quantity: number;
  discount: number;
  unitPrice: number;
  subtotal: number;
};

async function getOrderCustomer(client: PoolClient, companyId: number, customerId: string) {
  const customerResult = await client.query<OrderCustomerRow>(
    `
      SELECT id::text, display_name, legal_name, tax_id, fiscal_condition,
             price_list_name, receipt_type, seller_name, payment_term_days
      FROM clients
      WHERE id = $1::uuid AND empresa_id = $2 AND active = true
      LIMIT 1
    `,
    [customerId, companyId],
  );
  const customer = customerResult.rows[0];
  if (!customer) throw new ApiError(404, "Cliente no encontrado");
  return customer;
}

async function resolveBasicOrderDetail(
  client: PoolClient,
  companyId: number,
  input: ReturnType<typeof basicOrderInputFromBody>,
) {
  const customer = await getOrderCustomer(client, companyId, input.customerId);
  const priceListName = input.priceListOverride || customer.price_list_name || "";
  const desiredDocument = normalizeOrderCreationDocument(
    input.desiredDocumentOverride || customer.receipt_type || "",
    customer.fiscal_condition ?? "",
  );
  const receiptType = receiptTypeCode(desiredDocument);
  const includeVat = receiptAddsVat(desiredDocument);
  const priceListKey = normalizePriceListKey(priceListName);
  const productIds = input.lines.map((line) => line.productId);
  const quantities = input.lines.map((line) => line.quantity);
  const discounts = input.lines.map((line) => line.discount);
  const sortOrders = input.lines.map((_, index) => index);
  const unitPriceExpression = priceSqlExpression(priceListKey);

  const products = await client.query<{
    product_id: string;
    description: string;
    quantity: string;
    discount: string;
    unit_price: string;
    sort_order: number;
  }>(
    `
      WITH requested AS (
        SELECT *
        FROM unnest($1::uuid[], $2::numeric[], $3::numeric[], $4::int[])
          AS request(product_id, quantity, discount, sort_order)
      )
      SELECT p.id::text AS product_id,
             p.name AS description,
             request.quantity::text,
             request.discount::text,
             COALESCE(NULLIF(${unitPriceExpression}, 0), p.sale_price, p.cost, 0)::text AS unit_price,
             request.sort_order
      FROM requested request
      JOIN products p ON p.id = request.product_id AND p.empresa_id = $5 AND p.active = true
      LEFT JOIN margenes m
        ON m.empresa_id = p.empresa_id
       AND m.codigo = ${productMarginCodeExpression("p")}
      ORDER BY request.sort_order ASC
    `,
    [productIds, quantities, discounts, sortOrders, companyId],
  );

  if (products.rowCount !== input.lines.length) {
    throw new ApiError(400, "Uno o mas productos del pedido no existen o estan inactivos");
  }

  const detail = products.rows.map<ResolvedOrderDetailLine>((product) => {
    const quantity = Number(product.quantity);
    const discount = Number(product.discount);
    const unitPrice = money(Number(product.unit_price));
    if (unitPrice <= 0) {
      throw new ApiError(400, `El producto ${product.description} no tiene precio para la lista del cliente`);
    }
    return {
      productId: product.product_id,
      description: product.description,
      quantity,
      discount,
      unitPrice,
      subtotal: lineSubtotal(unitPrice, quantity, discount),
    };
  });

  const netAmount = money(detail.reduce((total, line) => total + line.subtotal, 0));
  const vatAmount = includeVat ? money(netAmount * 0.21) : 0;
  const totalAmount = money(netAmount + vatAmount);
  if (totalAmount <= 0) throw new ApiError(400, "El pedido no tiene importe calculable");

  return {
    customer,
    detail,
    priceListName,
    desiredDocument,
    receiptType,
    netAmount,
    vatAmount,
    totalAmount,
  };
}

async function insertOrderDetailLines(
  client: PoolClient,
  companyId: number,
  orderId: string,
  detail: ResolvedOrderDetailLine[],
) {
  for (const line of detail) {
    await client.query(
      `
        INSERT INTO sale_items (
          sale_id, product_id, description, quantity, unit_price, discount, total_amount, empresa_id
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
      `,
      [
        orderId,
        line.productId,
        line.description,
        line.quantity,
        line.unitPrice,
        line.discount,
        line.subtotal,
        companyId,
      ],
    );
  }
}

async function replaceOrderDetailLines(
  client: PoolClient,
  companyId: number,
  orderId: string,
  detail: ResolvedOrderDetailLine[],
) {
  await client.query("DELETE FROM sale_items WHERE sale_id = $1::uuid AND empresa_id = $2", [
    orderId,
    companyId,
  ]);
  await insertOrderDetailLines(client, companyId, orderId, detail);
}

export async function getOrderFormData(companyId: number) {
  const clients = await queryWithCompanyContext<{
    id: string;
    display_name: string;
    legal_name: string | null;
    tax_id: string | null;
    fiscal_condition: string | null;
    phone: string | null;
    address: string | null;
    price_list_name: string | null;
    receipt_type: string | null;
    seller_name: string | null;
    payment_term_days: number | null;
  }>(
    companyId,
    `
      SELECT id::text, display_name, legal_name, tax_id, fiscal_condition,
             phone, address, price_list_name, receipt_type, seller_name, payment_term_days
      FROM clients
      WHERE empresa_id = $1 AND active = true
      ORDER BY display_name ASC, id ASC
    `,
    [companyId],
  );

  const products = await queryWithCompanyContext<{
    id: string;
    code: string;
    name: string;
    available: string;
    price_0: string;
    price_1: string;
    price_2: string;
    price_3: string;
    price_4: string;
    price_rev: string;
  }>(
    companyId,
    `
      SELECT p.id::text AS id,
             COALESCE(p.sku, p.category_code, '') AS code,
             p.name,
             GREATEST(COALESCE(stock.stock_real, 0) - COALESCE(reserved.reserved, 0), 0)::text AS available,
             COALESCE(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_0, 1), 2), p.sale_price, 0)::text AS price_0,
             COALESCE(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_1, 1), 2), p.sale_price, 0)::text AS price_1,
             COALESCE(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_2, 1), 2), p.sale_price, 0)::text AS price_2,
             COALESCE(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_3, 1), 2), p.sale_price, 0)::text AS price_3,
             COALESCE(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_3, 1), 2), p.sale_price, 0)::text AS price_4,
             COALESCE(ROUND(COALESCE(p.cost, 0) * COALESCE(m.margen_minorista, 1), 2), p.sale_price, 0)::text AS price_rev
      FROM products p
      LEFT JOIN margenes m
        ON m.empresa_id = p.empresa_id
       AND m.codigo = ${productMarginCodeExpression("p")}
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(
          CASE
            WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
            ELSE -sm.quantity
          END
        ), 0) AS stock_real
        FROM stock_movements sm
        WHERE sm.empresa_id = p.empresa_id AND sm.product_id = p.id
      ) stock ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(si.quantity), 0) AS reserved
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.empresa_id = si.empresa_id
        WHERE si.empresa_id = p.empresa_id
          AND si.product_id = p.id
          AND ${normalizedOrderStatusSql("s")} = 'confirmado'
          AND COALESCE(s.stock_discounted, false) = false
      ) reserved ON true
      WHERE p.empresa_id = $1 AND p.active = true
      ORDER BY p.name ASC, p.id ASC
    `,
    [companyId],
  );

  return {
    clients: clients.rows.map<OrderFormClient>((row) => ({
      id: row.id,
      name: row.display_name || row.legal_name || "Cliente sin nombre",
      legalName: row.legal_name ?? "",
      taxId: row.tax_id ?? "",
      fiscalCondition: row.fiscal_condition ?? "",
      phone: row.phone ?? "",
      address: row.address ?? "",
      priceList: row.price_list_name ?? "",
      receiptType: row.receipt_type ?? "",
      seller: row.seller_name ?? "",
      paymentTermDays: row.payment_term_days,
    })),
    products: products.rows.map<OrderFormProduct>((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      available: Number(row.available),
      prices: {
        0: Number(row.price_0),
        1: Number(row.price_1),
        2: Number(row.price_2),
        3: Number(row.price_3),
        4: Number(row.price_4),
        rev: Number(row.price_rev),
      },
    })),
  };
}

export function basicOrderInputFromBody(body: RequestBody) {
  const customerId = uuidParam(
    textField(body, "customerId") || textField(body, "id_cliente"),
    "Cliente",
  );

  let rawLines: unknown[];
  try {
    rawLines = arrayFromJson(body.productsJson ?? body.productos_json ?? body.products ?? body.productos, "Detalle");
  } catch {
    throw new ApiError(400, "Agrega al menos un producto");
  }

  const lines = rawLines
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map<BasicOrderLineInput>((item) => ({
      productId: uuidParam(
        String(item.productId ?? item.product_id ?? item.id_producto ?? item.id ?? "").trim(),
        "Producto",
      ),
      quantity: numericItemValue(item, ["quantity", "cantidad"], 0),
      discount: numericItemValue(item, ["discount", "descuento"], 0),
    }))
    .filter((line) => line.quantity > 0);

  if (!lines.length) throw new ApiError(400, "Agrega al menos un producto");
  if (lines.some((line) => line.discount < 0 || line.discount > 100)) {
    throw new ApiError(400, "El descuento debe estar entre 0 y 100");
  }

  return {
    customerId,
    lines,
    date: textField(body, "date") || textField(body, "fecha") || new Date().toISOString().slice(0, 10),
    priceListOverride: textField(body, "priceListOverride") || textField(body, "lista_precios"),
    desiredDocumentOverride: textField(body, "desiredDocumentOverride") || textField(body, "comprobante_deseado"),
    observation: textField(body, "observation") || textField(body, "observacion"),
  };
}

export async function createBasicOrder(
  session: AuthSession,
  input: ReturnType<typeof basicOrderInputFromBody>,
) {
  const createdId = await withCompanyContext(session.companyId, async (client) => {
    const {
      customer,
      detail,
      priceListName,
      desiredDocument,
      receiptType,
      netAmount,
      vatAmount,
      totalAmount,
    } = await resolveBasicOrderDetail(client, session.companyId, input);

    await client.query("SELECT pg_advisory_xact_lock(83010, $1::int)", [session.companyId]);
    const sequence = await client.query<{ value: string }>(
      "SELECT (COALESCE(MAX(receipt_number), 0) + 1)::text AS value FROM sales WHERE empresa_id = $1",
      [session.companyId],
    );
    const receiptNumber = Number(sequence.rows[0]?.value ?? 0);
    const saleNumber = `P-${String(receiptNumber).padStart(6, "0")}`;

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sales (
          sale_number, client_id, seller_id, client_name, client_document, price_list_name,
          total_amount, receipt_number, receipt_type, payment_condition, sale_date, seller_name,
          collection_status, order_status, desired_document, notes,
          stock_discounted, status, empresa_id
        )
        VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                'no_aplica', 'cargado', $13, $14, false, 'cargado', $15)
        RETURNING id::text AS id
      `,
      [
        saleNumber,
        customer.id,
        session.userId,
        customer.display_name || customer.legal_name || "",
        customer.tax_id ?? "",
        priceListName,
        totalAmount,
        receiptNumber,
        receiptType,
        fallbackPaymentCondition(customer.payment_term_days),
        input.date,
        customer.seller_name || session.username,
        desiredDocument,
        input.observation,
        session.companyId,
      ],
    );
    const orderId = result.rows[0].id;

    await insertOrderDetailLines(client, session.companyId, orderId, detail);

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "pedido.cargado",
        JSON.stringify({
          id: orderId,
          usuario: session.username,
          cliente: customer.display_name,
          lista_precios: priceListName,
          comprobante: desiredDocument,
          neto: netAmount,
          iva: vatAmount,
          total: totalAmount,
        }),
        session.companyId,
      ],
    );

    return orderId;
  });

  clearReadQueryCache();
  return getOrder(session.companyId, createdId);
}

export async function updateBasicOrder(
  session: AuthSession,
  id: string,
  input: ReturnType<typeof basicOrderInputFromBody>,
) {
  const updatedId = await withCompanyContext(session.companyId, async (client) => {
    const currentResult = await client.query<{ estado_pedido: string }>(
      `
        SELECT ${normalizedOrderStatusSql("s")} AS estado_pedido
        FROM sales s
        WHERE s.id = $1::uuid AND s.empresa_id = $2
        LIMIT 1
        FOR UPDATE OF s
      `,
      [id, session.companyId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, "Pedido no encontrado");
    if (normalizeOrderStatus(current.estado_pedido) !== "cargado") {
      throw new ApiError(400, "Solo se pueden modificar pedidos cargados antes de confirmarlos.");
    }

    const {
      customer,
      detail,
      priceListName,
      desiredDocument,
      receiptType,
      netAmount,
      vatAmount,
      totalAmount,
    } = await resolveBasicOrderDetail(client, session.companyId, input);

    await client.query(
      `
        UPDATE sales
        SET client_id = $1::uuid,
            client_name = $2,
            client_document = $3,
            price_list_name = $4,
            total_amount = $5,
            receipt_type = $6,
            payment_condition = $7,
            sale_date = $8,
            seller_name = $9,
            collection_status = 'no_aplica',
            order_status = 'cargado',
            status = 'cargado',
            desired_document = $10,
            notes = $11,
            stock_discounted = false,
            updated_at = now()
        WHERE id = $12::uuid AND empresa_id = $13
      `,
      [
        customer.id,
        customer.display_name || customer.legal_name || "",
        customer.tax_id ?? "",
        priceListName,
        totalAmount,
        receiptType,
        fallbackPaymentCondition(customer.payment_term_days),
        input.date,
        customer.seller_name || session.username,
        desiredDocument,
        input.observation,
        id,
        session.companyId,
      ],
    );

    await replaceOrderDetailLines(client, session.companyId, id, detail);

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "pedido.modificado",
        JSON.stringify({
          id,
          usuario: session.username,
          cliente: customer.display_name,
          lista_precios: priceListName,
          comprobante: desiredDocument,
          neto: netAmount,
          iva: vatAmount,
          total: totalAmount,
        }),
        session.companyId,
      ],
    );

    return id;
  });

  clearReadQueryCache();
  return getOrder(session.companyId, updatedId);
}

export async function updateOrderObservation(companyId: number, id: string, observation: string) {
  const trimmedObservation = observation.slice(0, 2000);
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    "UPDATE sales SET notes = $1, updated_at = now() WHERE id = $2::uuid AND empresa_id = $3 RETURNING id::text AS id",
    [trimmedObservation, id, companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Pedido no encontrado");
  clearReadQueryCache();
  return getOrder(companyId, id);
}

export async function updateOrderStatus(
  session: AuthSession,
  id: string,
  nextStatus: OrderStatus,
  options: { confirmationDocument?: string } = {},
) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const orderResult = await client.query<{
      estado_pedido: string;
      desired_document: string;
      fiscal_condition: string;
    }>(
      `
        SELECT ${normalizedOrderStatusSql("s")} AS estado_pedido,
               COALESCE(s.desired_document, 'remito') AS desired_document,
               COALESCE(c.fiscal_condition, '') AS fiscal_condition
        FROM sales s
        LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        WHERE s.id = $1::uuid AND s.empresa_id = $2
        LIMIT 1
        FOR UPDATE OF s
      `,
      [id, session.companyId],
    );
    const order = orderResult.rows[0];
    if (!order) throw new ApiError(404, "Pedido no encontrado");

    const currentStatus = normalizeOrderStatus(order.estado_pedido);
    if (currentStatus === nextStatus) {
      throw new ApiError(400, `El pedido ya esta en '${currentStatus}'.`);
    }
    if (currentStatus === "entregado" || currentStatus === "cancelado") {
      throw new ApiError(400, `El pedido ya esta ${currentStatus} y no puede modificarse.`);
    }
    if (nextStatus === "cargado") {
      throw new ApiError(400, "No se puede volver un pedido a cargado.");
    }
    if (nextStatus === "confirmado" && currentStatus !== "cargado") {
      throw new ApiError(400, "Solo los pedidos cargados pueden confirmarse.");
    }
    if (nextStatus === "entregado" && currentStatus !== "confirmado") {
      throw new ApiError(400, "Solo los pedidos confirmados pueden marcarse como entregados.");
    }

    let stockDiscounted = false;
    if (nextStatus === "entregado") {
      stockDiscounted = await discountSaleStockIfAvailable(
        client,
        session.companyId,
        id,
        `Descuento por entrega de pedido ${id}`,
      );
    }

    const nextCollectionStatus =
      nextStatus === "entregado" ? "pendiente" : nextStatus === "cancelado" ? "cancelado" : "no_aplica";
    const confirmationDocument =
      nextStatus === "confirmado"
        ? normalizeOrderConfirmationDocument(
            options.confirmationDocument ?? "",
            order.fiscal_condition,
            order.desired_document,
          )
        : "";
    let confirmationTotalAmount = 0;
    let confirmationReceiptType = 0;
    if (confirmationDocument) {
      const totals = await client.query<{ net_amount: string }>(
        `
          SELECT COALESCE(SUM(total_amount), 0)::text AS net_amount
          FROM sale_items
          WHERE sale_id = $1::uuid AND empresa_id = $2
        `,
        [id, session.companyId],
      );
      const netAmount = money(Number(totals.rows[0]?.net_amount ?? 0));
      const vatAmount = receiptAddsVat(confirmationDocument) ? money(netAmount * 0.21) : 0;
      confirmationTotalAmount = money(netAmount + vatAmount);
      confirmationReceiptType = receiptTypeCode(confirmationDocument);
    }

    const updateParams: unknown[] = [nextStatus, id, session.companyId, nextCollectionStatus];
    let confirmationUpdate = "";
    if (confirmationDocument) {
      updateParams.push(confirmationDocument, confirmationReceiptType, confirmationTotalAmount);
      confirmationUpdate = `,
            desired_document = $5,
            receipt_type = $6,
            total_amount = $7`;
    }

    await client.query(
      `
        UPDATE sales
        SET order_status = $1,
            status = $1,
            collection_status = $4${confirmationUpdate},
            updated_at = now()
        WHERE id = $2::uuid AND empresa_id = $3
      `,
      updateParams,
    );

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        nextStatus === "confirmado"
          ? "pedido.confirmado_stock"
          : nextStatus === "entregado"
            ? "pedido.entregado"
            : "pedido.cancelado",
        JSON.stringify({
          id,
          estado_anterior: currentStatus,
          estado_nuevo: nextStatus,
          comprobante: confirmationDocument || order.desired_document,
          stock_pendiente_impresion: nextStatus === "confirmado",
          cobro_habilitado: nextStatus === "entregado",
          usuario: session.username,
        }),
        session.companyId,
      ],
    );

    return { status: nextStatus, stockDiscounted };
  });

  clearReadQueryCache();
  return result;
}

export async function updateOrderCollectionStatus(
  session: AuthSession,
  id: string,
  collectionStatus: string,
) {
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `
      UPDATE sales
      SET collection_status = $1,
          updated_at = now()
      WHERE id = $2::uuid AND empresa_id = $3
      RETURNING id::text AS id
    `,
    [collectionStatus, id, session.companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Pedido no encontrado");
  clearReadQueryCache();
  await insertIntegrationEvent(session.companyId, "cobro.estado_cambiado", {
    id,
    estado_cobro: collectionStatus,
    usuario: session.username,
  });

  return getOrder(session.companyId, id);
}
