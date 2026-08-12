import { ApiError } from "@/lib/api-response";
import { reactivateClientIfInactive } from "@/lib/client-reactivation";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { summarizeDurations } from "@/lib/delivery-times";
import {
  lineSubtotal,
  money,
  normalizePriceListKey,
  resolvePriceListName,
  samePriceListName,
  type PriceListOption,
  type ProductPriceMap,
} from "@/lib/order-pricing";
import { parsePagination } from "@/lib/pagination";
import { dynamicPriceSqlExpression, productMarginCodeExpression } from "@/lib/product-pricing-sql";
import { listPriceLists } from "@/lib/pricing";
import {
  type OrderStatus,
  isOrderStatus,
  normalizeOrderStatusValue,
  normalizedOrderStatusSql,
  orderStatusTransitionError,
  saleReservesStockSql,
} from "@/lib/order-status";
import {
  receiptTypeCode,
  saleOrderDocument,
  saleVatRateForDocument,
} from "@/lib/receipt-types";
import { textField, uuidParam, type RequestBody } from "@/lib/request-body";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { assertSaleStockAvailableForConfirmation, discountSaleStockOnDelivery } from "@/lib/stock";
import { createDeliveryDocumentForSale } from "@/lib/deliveries";
import { localDateIso } from "@/lib/timezone";
import {
  normalizeStoredVatRate,
  vatAmountsFromGross,
  vatAmountsFromNet,
  type SaleVatRate,
  type StoredVatRate,
} from "@/lib/vat-calculation";
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
  commercialNumber: number | null;
  saleNumber: string;
  deliveryNumber: number | null;
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
  vatRate: StoredVatRate;
  fiscalStatus: string;
  hasPendingFiscalRequest: boolean;
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
  prices: ProductPriceMap;
};

export type OrderFormPriceList = PriceListOption;

type BasicOrderLineInput = {
  productId: string;
  quantity: number;
  discount: number;
};

export type OrderVatRate = SaleVatRate;

const DEFAULT_COMPANY_ID = 1;
const COLLECTION_STATES = ["pendiente", "cancelado"] as const;

function searchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function mapOrder(row: {
  id: string;
  client_id: string | null;
  commercial_number: number | string | null;
  sale_number: string;
  delivery_number: number | string | null;
  client_name: string;
  client_document: string;
  fiscal_condition: string;
  price_list_name: string;
  monto: string;
  item_net: string;
  item_count: string;
  monto_cobrado: string;
  saldo_pendiente: string;
  receipt_number: number | null;
  payment_condition: string;
  fecha: string | null;
  seller: string;
  collection_status: string;
  order_status: string;
  desired_document: string;
  stock_discounted: boolean;
  notes: string;
  vat_rate: string;
  fiscal_status: string;
  has_pending_fiscal_request: boolean;
}): OrderSummary {
  const vatRate = normalizeStoredVatRate(Number(row.vat_rate));
  const storedAmounts = splitStoredOrderTotal(Number(row.monto), vatRate);
  const hasStoredItems = Number(row.item_count) > 0;
  const netAmount = hasStoredItems ? money(Number(row.item_net)) : storedAmounts.netAmount;
  const vatAmount = hasStoredItems
    ? money(Math.max(0, storedAmounts.totalAmount - netAmount))
    : storedAmounts.vatAmount;
  return {
    id: row.id,
    commercialNumber: row.commercial_number === null ? null : Number(row.commercial_number),
    saleNumber: row.sale_number,
    deliveryNumber: row.delivery_number === null ? null : Number(row.delivery_number),
    customerId: row.client_id,
    customerName: row.client_name,
    customerDocument: row.client_document,
    customerFiscalCondition: row.fiscal_condition,
    priceList: row.price_list_name,
    amount: storedAmounts.totalAmount,
    collectedAmount: Number(row.monto_cobrado),
    outstandingAmount: Number(row.saldo_pendiente),
    netAmount,
    vatAmount,
    receiptNumber: Number(row.receipt_number ?? 0),
    paymentCondition: row.payment_condition,
    date: row.fecha,
    seller: row.seller,
    collectionStatus: row.collection_status,
    orderStatus: normalizeOrderStatus(row.order_status),
    desiredDocument: row.desired_document,
    stockDiscounted: row.stock_discounted,
    observation: row.notes,
    vatRate,
    fiscalStatus: row.fiscal_status,
    hasPendingFiscalRequest: row.has_pending_fiscal_request,
  };
}

function normalizeOrderStatus(status: string) {
  return normalizeOrderStatusValue(status);
}

export function calculateOrderTotals(netAmount: number, vatRate: OrderVatRate) {
  const totals = vatAmountsFromNet(netAmount, vatRate);
  return {
    netAmount: totals.net,
    vatAmount: totals.vat,
    totalAmount: totals.total,
  };
}

export function hasConsistentOrderVatSnapshot(input: {
  desiredDocument: unknown;
  receiptType: unknown;
  vatRate: unknown;
}) {
  const desiredDocument = saleOrderDocument(String(input.desiredDocument ?? ""));
  const expectedVatRate = saleVatRateForDocument(desiredDocument);
  return Boolean(
    desiredDocument
      && expectedVatRate
      && normalizeStoredVatRate(input.vatRate) === expectedVatRate
      && Number(input.receiptType) === receiptTypeCode(desiredDocument),
  );
}

export function splitStoredOrderTotal(totalAmount: number, vatRate: StoredVatRate) {
  const totals = vatRate === 0
    ? vatAmountsFromNet(totalAmount, 0)
    : vatAmountsFromGross(totalAmount, vatRate);
  return {
    netAmount: totals.net,
    vatAmount: totals.vat,
    totalAmount: totals.total,
  };
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
      `(COALESCE(s.client_name, '') ILIKE $${params.length} ESCAPE '\\' OR COALESCE(s.client_document, '') ILIKE $${params.length} ESCAPE '\\' OR COALESCE(s.seller_name, '') ILIKE $${params.length} ESCAPE '\\' OR COALESCE(s.sale_number, '') ILIKE $${params.length} ESCAPE '\\' OR COALESCE(lpad(s.commercial_number::text, GREATEST(4, length(s.commercial_number::text)), '0'), '') ILIKE $${params.length} ESCAPE '\\')`,
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
      SELECT s.id::text AS id, s.client_id::text AS client_id, s.commercial_number,
             COALESCE(s.sale_number, '') AS sale_number,
             COALESCE(s.client_name, c.display_name, '') AS client_name,
             COALESCE(NULLIF(s.client_document, ''), c.tax_id, '') AS client_document,
             COALESCE(c.fiscal_condition, '') AS fiscal_condition,
             COALESCE(s.price_list_name, c.price_list_name, '') AS price_list_name,
             COALESCE(s.total_amount, 0)::text AS monto,
             COALESCE(item_totals.net_amount, 0)::text AS item_net,
             COALESCE(item_totals.item_count, 0)::text AS item_count,
             COALESCE(collections.total_credit, 0)::text AS monto_cobrado,
             GREATEST(COALESCE(s.total_amount, 0) - COALESCE(collections.total_credit, 0), 0)::text AS saldo_pendiente,
             COALESCE(s.vat_rate, 0)::text AS vat_rate,
             s.receipt_number,
             dd.delivery_number,
             COALESCE(s.payment_condition, '') AS payment_condition,
             s.sale_date::text AS fecha,
             COALESCE(s.seller_name, c.seller_name, '') AS seller,
             COALESCE(s.collection_status, 'pendiente') AS collection_status,
             ${normalizedOrderStatusSql("s")} AS order_status,
             COALESCE(s.desired_document, '') AS desired_document,
             s.stock_discounted,
             COALESCE(s.notes, '') AS notes,
             COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
             EXISTS (
               SELECT 1 FROM app_solicitudes sol
               WHERE sol.empresa_id = s.empresa_id
                 AND sol.estado = 'pendiente'
                 AND sol.metadata->>'action' = 'fiscal_invoice'
                 AND sol.metadata->>'saleId' = s.id::text
             ) AS has_pending_fiscal_request
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      LEFT JOIN delivery_documents dd ON dd.sale_id = s.id AND dd.empresa_id = s.empresa_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(si.total_amount), 0) AS net_amount,
               COUNT(*) AS item_count
        FROM sale_items si
        WHERE si.empresa_id = s.empresa_id AND si.sale_id = s.id
      ) item_totals ON true
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

export async function getOrder(companyId: number, id: string): Promise<OrderDetail> {
  const orderResult = await queryWithCompanyContext<Parameters<typeof mapOrder>[0]>(
    companyId,
    `
      SELECT s.id::text AS id, s.client_id::text AS client_id, s.commercial_number,
             COALESCE(s.sale_number, '') AS sale_number,
             COALESCE(s.client_name, c.display_name, '') AS client_name,
             COALESCE(NULLIF(s.client_document, ''), c.tax_id, '') AS client_document,
             COALESCE(c.fiscal_condition, '') AS fiscal_condition,
             COALESCE(s.price_list_name, c.price_list_name, '') AS price_list_name,
             COALESCE(s.total_amount, 0)::text AS monto,
             COALESCE(item_totals.net_amount, 0)::text AS item_net,
             COALESCE(item_totals.item_count, 0)::text AS item_count,
             COALESCE(collections.total_credit, 0)::text AS monto_cobrado,
             GREATEST(COALESCE(s.total_amount, 0) - COALESCE(collections.total_credit, 0), 0)::text AS saldo_pendiente,
             COALESCE(s.vat_rate, 0)::text AS vat_rate,
             s.receipt_number,
             dd.delivery_number,
             COALESCE(s.payment_condition, '') AS payment_condition,
             s.sale_date::text AS fecha,
             COALESCE(s.seller_name, c.seller_name, '') AS seller,
             COALESCE(s.collection_status, 'pendiente') AS collection_status,
             ${normalizedOrderStatusSql("s")} AS order_status,
             COALESCE(s.desired_document, '') AS desired_document,
             s.stock_discounted,
             COALESCE(s.notes, '') AS notes,
             COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
             EXISTS (
               SELECT 1 FROM app_solicitudes sol
               WHERE sol.empresa_id = s.empresa_id
                 AND sol.estado = 'pendiente'
                 AND sol.metadata->>'action' = 'fiscal_invoice'
                 AND sol.metadata->>'saleId' = s.id::text
             ) AS has_pending_fiscal_request
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      LEFT JOIN delivery_documents dd ON dd.sale_id = s.id AND dd.empresa_id = s.empresa_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(si.total_amount), 0) AS net_amount,
               COUNT(*) AS item_count
        FROM sale_items si
        WHERE si.empresa_id = s.empresa_id AND si.sale_id = s.id
      ) item_totals ON true
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
      WHERE id = $1::uuid AND empresa_id = $2
      LIMIT 1
    `,
    [customerId, companyId],
  );
  const customer = customerResult.rows[0];
  if (!customer) throw new ApiError(404, "Cliente no encontrado");
  await reactivateClientIfInactive(client, companyId, customerId);
  return customer;
}

async function getActivePriceListNames(client: PoolClient, companyId: number) {
  const result = await client.query<{ nombre: string }>(
    `
      SELECT nombre
      FROM listas_precio
      WHERE empresa_id = $1 AND activa = 1
      ORDER BY orden ASC, nombre ASC
    `,
    [companyId],
  );
  return result.rows.map((row) => row.nombre);
}

async function resolveBasicOrderDetail(
  client: PoolClient,
  companyId: number,
  input: ReturnType<typeof basicOrderInputFromBody>,
) {
  const customer = await getOrderCustomer(client, companyId, input.customerId);
  const activePriceLists = await getActivePriceListNames(client, companyId);
  const priceListName = resolvePriceListName(input.priceListOverride || customer.price_list_name, activePriceLists);
  const desiredDocument = saleOrderDocument(customer.receipt_type);
  const vatRate = saleVatRateForDocument(customer.receipt_type);
  if (!desiredDocument || !vatRate) {
    throw new ApiError(
      400,
      "El cliente no tiene un comprobante valido. Configuralo como Remito, Factura A o Factura B antes de cargar el pedido.",
    );
  }
  const receiptType = receiptTypeCode(desiredDocument);
  const priceListKey = normalizePriceListKey(priceListName);
  const productIds = input.lines.map((line) => line.productId);
  const quantities = input.lines.map((line) => line.quantity);
  const discounts = input.lines.map((line) => line.discount);
  const sortOrders = input.lines.map((_, index) => index);
  const unitPriceExpression = dynamicPriceSqlExpression(priceListKey);

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
      LEFT JOIN listas_precio selected_list
        ON selected_list.empresa_id = p.empresa_id
       AND selected_list.activa = 1
       AND lower(selected_list.nombre) = lower($6)
      LEFT JOIN margenes_listas selected_margin
        ON selected_margin.empresa_id = p.empresa_id
       AND selected_margin.lista_id = selected_list.id
       AND selected_margin.codigo = ${productMarginCodeExpression("p")}
      ORDER BY request.sort_order ASC
    `,
    [productIds, quantities, discounts, sortOrders, companyId, priceListName],
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
  if (netAmount <= 0) throw new ApiError(400, "El pedido no tiene importe calculable");

  return {
    customer,
    detail,
    priceListName,
    desiredDocument,
    receiptType,
    vatRate,
    netAmount,
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

export async function getOrderFormData(
  companyId: number,
  options: { excludeReservedSaleId?: string } = {},
) {
  const [clients, priceLists] = await Promise.all([
    queryWithCompanyContext<{
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
      WHERE empresa_id = $1
      ORDER BY display_name ASC, id ASC
    `,
    [companyId],
  ),
    listPriceLists(companyId),
  ]);

  const products = await queryWithCompanyContext<{
    id: string;
    code: string;
    name: string;
    available: string;
    list_prices: Record<string, string | number> | null;
    fallback_price: string;
  }>(
    companyId,
    `
      SELECT p.id::text AS id,
             COALESCE(p.sku, p.category_code, '') AS code,
             p.name,
             GREATEST(COALESCE(stock.stock_real, 0) - COALESCE(reserved.reserved, 0), 0)::text AS available,
             COALESCE(price_map.list_prices, '{}'::jsonb) AS list_prices,
             COALESCE(NULLIF(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_1, 1), 2), 0), p.sale_price, p.cost, 0)::text AS fallback_price
      FROM products p
      LEFT JOIN margenes m
        ON m.empresa_id = p.empresa_id
       AND m.codigo = ${productMarginCodeExpression("p")}
      LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(
          lp.nombre,
          COALESCE(
            NULLIF(ROUND(COALESCE(p.cost, 0) * NULLIF(ml.multiplicador, 1), 2), 0),
            NULLIF(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_1, 1), 2), 0),
            p.sale_price,
            p.cost,
            0
          )
        ) AS list_prices
        FROM listas_precio lp
        LEFT JOIN margenes_listas ml
          ON ml.empresa_id = lp.empresa_id
         AND ml.lista_id = lp.id
         AND ml.codigo = ${productMarginCodeExpression("p")}
        WHERE lp.empresa_id = p.empresa_id AND lp.activa = 1
      ) price_map ON true
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
          AND ${saleReservesStockSql("s")}
          AND ($2::uuid IS NULL OR s.id <> $2::uuid)
      ) reserved ON true
      WHERE p.empresa_id = $1 AND p.active = true
      ORDER BY p.name ASC, p.id ASC
    `,
    [companyId, options.excludeReservedSaleId ?? null],
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
    priceLists: priceLists
      .filter((list) => priceLists.length === 1 || !samePriceListName(list.name, "General"))
      .map<OrderFormPriceList>((list) => ({
      id: list.id,
      name: list.name,
    })),
    products: products.rows.map<OrderFormProduct>((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      available: Number(row.available),
      prices: Object.fromEntries(
        Object.entries(row.list_prices ?? { General: row.fallback_price }).map(([name, value]) => [
          name,
          Number(value),
        ]),
      ),
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

  const parsedLines = rawLines
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map<BasicOrderLineInput>((item) => ({
      productId: uuidParam(
        String(item.productId ?? item.product_id ?? item.id_producto ?? item.id ?? "").trim(),
        "Producto",
      ),
      quantity: numericItemValue(item, ["quantity", "cantidad"], 0),
      discount: numericItemValue(item, ["discount", "descuento"], 0),
    }));

  if (parsedLines.some((line) => !Number.isInteger(line.quantity))) {
    throw new ApiError(400, "La cantidad de cada producto debe ser un numero entero");
  }

  const lines = parsedLines.filter((line) => line.quantity > 0);

  if (!lines.length) throw new ApiError(400, "Agrega al menos un producto");
  if (lines.some((line) => line.discount < 0 || line.discount > 100)) {
    throw new ApiError(400, "El descuento debe estar entre 0 y 100");
  }

  return {
    customerId,
    lines,
    date: textField(body, "date") || textField(body, "fecha") || localDateIso(),
    priceListOverride: textField(body, "priceListOverride") || textField(body, "lista_precios"),
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
      vatRate,
      netAmount,
    } = await resolveBasicOrderDetail(client, session.companyId, input);
    const amounts = calculateOrderTotals(netAmount, vatRate);

    await client.query("SELECT pg_advisory_xact_lock(83010, $1::int)", [session.companyId]);
    const sequence = await client.query<{ value: string }>(
      "SELECT (COALESCE(MAX(commercial_number), 0) + 1)::text AS value FROM sales WHERE empresa_id = $1",
      [session.companyId],
    );
    const commercialNumber = Number(sequence.rows[0]?.value ?? 1);
    const receiptNumber = commercialNumber;
    const saleNumber = `P-${String(commercialNumber).padStart(4, "0")}`;

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sales (
          sale_number, commercial_number, client_id, seller_id, client_name, client_document, price_list_name,
          total_amount, receipt_number, receipt_type, payment_condition, sale_date, seller_name,
          collection_status, order_status, desired_document, notes, vat_rate,
          stock_discounted, status, empresa_id
        )
        VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                'no_aplica', 'cargado', $14, $15, $16, false, 'cargado', $17)
        RETURNING id::text AS id
      `,
      [
        saleNumber,
        commercialNumber,
        customer.id,
        session.userId,
        customer.display_name || customer.legal_name || "",
        customer.tax_id ?? "",
        priceListName,
        amounts.totalAmount,
        receiptNumber,
        receiptType,
        fallbackPaymentCondition(customer.payment_term_days),
        input.date,
        customer.seller_name || session.username,
        desiredDocument,
        input.observation,
        vatRate,
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
          subtotal: amounts.netAmount,
          iva_tasa: vatRate,
          iva: amounts.vatAmount,
          total: amounts.totalAmount,
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
    const currentResult = await client.query<{
      estado_pedido: string;
      desired_document: string;
      receipt_type: number;
      vat_rate: string;
    }>(
      `
        SELECT ${normalizedOrderStatusSql("s")} AS estado_pedido,
               COALESCE(s.desired_document, '') AS desired_document,
               COALESCE(s.receipt_type, 0) AS receipt_type,
               COALESCE(s.vat_rate, 0)::text AS vat_rate
        FROM sales s
        WHERE s.id = $1::uuid AND s.empresa_id = $2
        LIMIT 1
        FOR UPDATE OF s
      `,
      [id, session.companyId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, "Pedido no encontrado");
    const estadoActual = normalizeOrderStatus(current.estado_pedido);
    if (estadoActual !== "cargado" && estadoActual !== "confirmado") {
      throw new ApiError(400, "Solo se pueden modificar pedidos cargados o confirmados.");
    }
    if (!hasConsistentOrderVatSnapshot({
      desiredDocument: current.desired_document,
      receiptType: current.receipt_type,
      vatRate: current.vat_rate,
    })) {
      throw new ApiError(
        409,
        "El pedido historico no tiene un comprobante e IVA consistentes y no puede corregirse automaticamente.",
      );
    }

    const {
      customer,
      detail,
      priceListName,
      desiredDocument,
      receiptType,
      vatRate,
      netAmount,
    } = await resolveBasicOrderDetail(client, session.companyId, input);
    const amounts = calculateOrderTotals(netAmount, vatRate);

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
            vat_rate = $12,
            stock_discounted = false,
            updated_at = now()
        WHERE id = $13::uuid AND empresa_id = $14
      `,
      [
        customer.id,
        customer.display_name || customer.legal_name || "",
        customer.tax_id ?? "",
        priceListName,
        amounts.totalAmount,
        receiptType,
        fallbackPaymentCondition(customer.payment_term_days),
        input.date,
        customer.seller_name || session.username,
        desiredDocument,
        input.observation,
        vatRate,
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
          subtotal: amounts.netAmount,
          iva_tasa: vatRate,
          iva: amounts.vatAmount,
          total: amounts.totalAmount,
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
) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const orderResult = await client.query<{
      estado_pedido: string;
      desired_document: string;
      receipt_type: number;
      vat_rate: string;
    }>(
      `
        SELECT ${normalizedOrderStatusSql("s")} AS estado_pedido,
               COALESCE(s.desired_document, '') AS desired_document,
               COALESCE(s.receipt_type, 0) AS receipt_type,
               COALESCE(s.vat_rate, 0)::text AS vat_rate
        FROM sales s
        WHERE s.id = $1::uuid AND s.empresa_id = $2
        LIMIT 1
        FOR UPDATE OF s
      `,
      [id, session.companyId],
    );
    const order = orderResult.rows[0];
    if (!order) throw new ApiError(404, "Pedido no encontrado");

    const currentStatus = normalizeOrderStatus(order.estado_pedido);
    const transitionError = orderStatusTransitionError(currentStatus, nextStatus);
    if (transitionError) throw new ApiError(400, transitionError);

    if (
      (nextStatus === "confirmado" || nextStatus === "entregado")
      && !hasConsistentOrderVatSnapshot({
        desiredDocument: order.desired_document,
        receiptType: order.receipt_type,
        vatRate: order.vat_rate,
      })
    ) {
      throw new ApiError(
        409,
        "El pedido no tiene un comprobante e IVA consistentes. Corregilo antes de confirmarlo o entregarlo.",
      );
    }

    if (nextStatus === "confirmado") {
      await assertSaleStockAvailableForConfirmation(client, session.companyId, id);
    }

    let stockDiscounted = false;
    if (nextStatus === "entregado") {
      stockDiscounted = await discountSaleStockOnDelivery(
        client,
        session.companyId,
        id,
        `Descuento por entrega de pedido ${id}`,
      );
    }

    const nextCollectionStatus =
      nextStatus === "entregado" ? "pendiente" : nextStatus === "cancelado" ? "cancelado" : "no_aplica";
    await client.query(
      `
        UPDATE sales
        SET order_status = $1,
            status = $1,
            collection_status = $4,
            updated_at = now()
        WHERE id = $2::uuid AND empresa_id = $3
      `,
      [nextStatus, id, session.companyId, nextCollectionStatus],
    );

    const delivery =
      nextStatus === "entregado"
        ? await createDeliveryDocumentForSale(client, session, id, { onExisting: "return" })
        : null;

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
          comprobante: order.desired_document,
          remito_id: delivery?.id ?? null,
          nro_remito: delivery?.number ?? null,
          stock_pendiente_impresion: nextStatus === "confirmado",
          cobro_habilitado: nextStatus === "entregado",
          usuario: session.username,
        }),
        session.companyId,
      ],
    );

    return { status: nextStatus, stockDiscounted, delivery };
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

export type Delivery = { saleId: string; pedido: string; cliente: string; deliveredAt: string; leadMs: number };

// Tiempos de entrega del período a partir de los eventos pedido.entregado ya
// registrados por updateOrderStatus. Lead time = entrega - creación del pedido.
export async function getDeliveryTimes(
  companyId: number,
  bounds: { currentStart: string; nextStart: string },
): Promise<{ deliveries: Delivery[]; summary: { count: number; avgMs: number | null; medianMs: number | null } }> {
  const result = await queryWithCompanyContext<{
    sale_id: string;
    pedido: string;
    cliente: string;
    started_at: string;
    delivered_at: string;
  }>(
    companyId,
    `
      SELECT (e.datos->>'id') AS sale_id,
             COALESCE(NULLIF(s.sale_number, ''), '') AS pedido,
             COALESCE(NULLIF(s.client_name, ''), c.display_name, c.legal_name, '') AS cliente,
             s.created_at::text AS started_at,
             e.created_at::text AS delivered_at
      FROM eventos_integracion e
      JOIN sales s ON s.id = (e.datos->>'id')::uuid AND s.empresa_id = e.empresa_id
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE e.empresa_id = $1
        AND e.tipo = 'pedido.entregado'
        AND e.created_at >= ($2 || 'T00:00:00-03:00')::timestamptz
        AND e.created_at <  ($3 || 'T00:00:00-03:00')::timestamptz
      ORDER BY e.created_at DESC
    `,
    [companyId, bounds.currentStart, bounds.nextStart],
  );

  const deliveries: Delivery[] = [];
  for (const row of result.rows) {
    const leadMs = Date.parse(row.delivered_at) - Date.parse(row.started_at);
    if (!Number.isFinite(leadMs) || leadMs < 0) continue;
    deliveries.push({
      saleId: row.sale_id,
      pedido: row.pedido,
      cliente: row.cliente,
      deliveredAt: row.delivered_at.slice(0, 10),
      leadMs,
    });
  }
  const summary = summarizeDurations(deliveries.map((delivery) => delivery.leadMs));
  return { deliveries, summary };
}
