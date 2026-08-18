import type { PoolClient } from "pg";
import { ApiError } from "@/lib/api-response";
import { reactivateClientIfInactive } from "@/lib/client-reactivation";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { lineSubtotal, money, normalizePriceListKey, resolvePriceListName, type PriceListKey } from "@/lib/order-pricing";
import { dynamicPriceSqlExpression, productMarginCodeExpression } from "@/lib/product-pricing-sql";
import {
  receiptTypeCode,
  saleOrderDocument,
  saleVatRateForDocument,
  type SaleOrderDocument,
} from "@/lib/receipt-types";
import { intField, numberField, textField, uuidParam, type RequestBody } from "@/lib/request-body";
import { createCommercialRemittanceForSale } from "@/lib/deliveries";
import {
  isSaleVatRate,
  normalizeStoredVatRate,
  vatAmountsFromNet,
  type SaleVatRate,
  type StoredVatRate,
} from "@/lib/vat-calculation";
import type { AuthSession } from "@/lib/auth";

type QuoteCustomer = {
  name: string;
  businessName: string;
  address: string;
  phone: string;
  vatCondition: string;
  taxId: string;
};

type QuoteProduct = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  discount: number;
  netUnitPrice: number | null;
  subtotal: number | null;
};

type QuoteInput = {
  customerId: string;
  customer: QuoteCustomer;
  products: QuoteProduct[];
  discountPercent: number;
  activePriceList: number;
  priceListOverride: string;
  validityDays: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function arrayFromJson(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed;
  }
  throw new ApiError(400, `${label} invalido`);
}

function nestedText(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return value === undefined || value === null ? "" : String(value).trim();
}

function nestedNumber(input: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return fallback;
}

export function normalizeQuoteVatRate(value: number): StoredVatRate {
  if (value === 0 || isSaleVatRate(value)) return normalizeStoredVatRate(value);
  throw new ApiError(400, "El IVA debe ser 21%, 10,5% o no mostrarse");
}

export function acceptedQuoteVatSnapshot(input: {
  desiredDocument: unknown;
  vatRate: unknown;
  subtotalAmount: unknown;
  totalAmount: unknown;
}): { desiredDocument: SaleOrderDocument; vatRate: SaleVatRate } {
  const desiredDocument = saleOrderDocument(String(input.desiredDocument ?? ""));
  const expectedVatRate = saleVatRateForDocument(desiredDocument);
  const subtotalAmount = money(Number(input.subtotalAmount));
  const totalAmount = money(Number(input.totalAmount));
  const expectedTotal = expectedVatRate ? vatAmountsFromNet(subtotalAmount, expectedVatRate).total : 0;
  if (
    desiredDocument
    && expectedVatRate
    && normalizeStoredVatRate(input.vatRate) === expectedVatRate
    && subtotalAmount > 0
    && totalAmount === expectedTotal
  ) {
    return { desiredDocument, vatRate: expectedVatRate };
  }
  throw new ApiError(
    409,
    "El presupuesto no tiene un comprobante e IVA consistentes. Genera uno nuevo o corregilo manualmente antes de aceptarlo.",
  );
}

function nestedUuid(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return value;
    }
  }
  return "";
}

function priceListNumber(key: PriceListKey) {
  return key === "rev" ? 5 : Number(key);
}

function priceListNameFromNumber(value: number) {
  if (value === 0) return "L0 - agresivo";
  if (value === 1) return "L1 - suave";
  if (value === 2) return "L2 - ANCLA";
  if (value === 3) return "L3 - caro";
  if (value === 4 || value === 5) return "Minorista";
  return "";
}

export function hasFiscalCustomerData(taxId: string, fiscalCondition: string) {
  return taxId.replace(/\D/g, "").length === 11 && Boolean(fiscalCondition.trim());
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

export function quoteInputFromBody(body: RequestBody): QuoteInput {
  const customerBody = objectValue(body.customer ?? body.cliente);
  const rawCustomerId = textField(body, "customerId") || textField(body, "id_cliente");
  const customerId = rawCustomerId ? uuidParam(rawCustomerId, "Cliente") : "";
  const customer = {
    name:
      nestedText(customerBody, "name") ||
      nestedText(customerBody, "nombre") ||
      textField(body, "customerName"),
    businessName:
      nestedText(customerBody, "businessName") ||
      nestedText(customerBody, "razon_social") ||
      textField(body, "customerBusinessName"),
    address:
      nestedText(customerBody, "address") ||
      nestedText(customerBody, "domicilio") ||
      textField(body, "customerAddress"),
    phone:
      nestedText(customerBody, "phone") ||
      nestedText(customerBody, "telefono") ||
      textField(body, "customerPhone"),
    vatCondition:
      nestedText(customerBody, "vatCondition") ||
      nestedText(customerBody, "cond_iva") ||
      textField(body, "customerVatCondition"),
    taxId:
      nestedText(customerBody, "taxId") ||
      nestedText(customerBody, "cuit") ||
      textField(body, "customerTaxId"),
  };

  let rawProducts: unknown[];
  try {
    rawProducts = arrayFromJson(
      body.productsJson ?? body.productos_json ?? body.products ?? body.productos,
      "Detalle",
    );
  } catch {
    rawProducts = arrayValue(body.products ?? body.productos);
  }

  const products = rawProducts.map((raw) => {
    const product = objectValue(raw);
    const quantity = nestedNumber(product, ["quantity", "cantidad"], 1);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiError(400, "La cantidad debe ser un numero entero mayor a cero");
    }
    const unitPrice = nestedNumber(product, ["unitPrice", "precio_unit"], 0);
    const discount = clamp(nestedNumber(product, ["discount", "bonif"], 0), 0, 100);
    const netUnitPrice = unitPrice * (1 - discount / 100);
    return {
      id: nestedUuid(product, ["id", "productId", "product_id", "id_producto"]),
      name: nestedText(product, "name") || nestedText(product, "nombre"),
      quantity,
      unitPrice,
      discount,
      netUnitPrice,
      subtotal: Number((netUnitPrice * quantity).toFixed(2)),
    };
  });

  if (!products.length) throw new ApiError(400, "Agrega al menos un producto");

  return {
    customerId,
    customer,
    products,
    discountPercent: clamp(numberField(body, "discountPercent", numberField(body, "descuento", 0)), 0, 100),
    activePriceList: intField(body, "activePriceList", intField(body, "lista_activa", 0)),
    priceListOverride: textField(body, "priceListOverride") || textField(body, "lista_precios"),
    validityDays: clamp(intField(body, "validityDays", intField(body, "vigencia_dias", 15)), 1, 365),
  };
}

function mapQuote(row: {
  id: string;
  client_id: string | null;
  quote_number: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  cliente_nombre: string | null;
  cliente_razon_social: string | null;
  cliente_domicilio: string | null;
  cliente_telefono: string | null;
  cliente_cond_iva: string | null;
  cliente_cuit: string | null;
  total: string;
  active_price_list: number;
  price_list_name?: string | null;
  discount_percent: string;
  net_amount: string;
  discount_amount: string;
  subtotal_amount: string;
  include_vat: boolean;
  vat_rate: string;
  desired_document: string;
  vat_amount: string;
  validity_days: number;
  productos_json?: unknown;
  estado: string;
  creado_por: string | null;
  seller_id: string | null;
  visible_to_all: boolean;
  created_at?: string;
  dias_restantes?: number;
}) {
  const products = Array.isArray(row.productos_json)
    ? row.productos_json
    : typeof row.productos_json === "string"
      ? JSON.parse(row.productos_json)
      : undefined;

  return {
    id: row.id,
    clientId: row.client_id ?? "",
    sellerId: row.seller_id ?? "",
    visibleToAll: Boolean(row.visible_to_all),
    quoteNumber: row.quote_number || "Sin numero",
    issueDate: row.fecha_emision,
    expirationDate: row.fecha_vencimiento,
    customer: {
      name: row.cliente_nombre ?? "",
      businessName: row.cliente_razon_social ?? "",
      address: row.cliente_domicilio ?? "",
      phone: row.cliente_telefono ?? "",
      vatCondition: row.cliente_cond_iva ?? "",
      taxId: row.cliente_cuit ?? "",
    },
    activePriceList: row.active_price_list,
    priceListName: row.price_list_name || priceListNameFromNumber(row.active_price_list),
    discountPercent: Number(row.discount_percent),
    netAmount: Number(row.net_amount),
    discountAmount: Number(row.discount_amount),
    subtotal: Number(row.subtotal_amount),
    includeVat: row.include_vat,
    vatRate: normalizeQuoteVatRate(Number(row.vat_rate)),
    desiredDocument: saleOrderDocument(row.desired_document),
    vatAmount: Number(row.vat_amount),
    validityDays: Number(row.validity_days),
    total: Number(row.total),
    products,
    status: row.estado,
    createdBy: row.creado_por ?? "",
    createdAt: row.created_at,
    daysRemaining: row.dias_restantes,
    valid: row.dias_restantes === undefined ? undefined : row.dias_restantes >= 0,
  };
}

export async function listQuotes(companyId: number, status = "pendiente") {
  const result = await queryWithCompanyContext<Parameters<typeof mapQuote>[0]>(
    companyId,
    `
      SELECT q.id::text,
             q.client_id::text AS client_id,
             q.seller_id::text AS seller_id,
             q.visible_to_all,
             COALESCE(NULLIF(q.quote_number, ''), 'Sin numero') AS quote_number,
             q.created_at::date::text AS fecha_emision,
             (q.created_at::date + (q.validity_days || ' days')::interval)::date::text AS fecha_vencimiento,
             COALESCE(NULLIF(q.client_name, ''), c.display_name, c.legal_name, '') AS cliente_nombre,
             COALESCE(NULLIF(q.client_legal_name, ''), c.legal_name, c.display_name, '') AS cliente_razon_social,
             COALESCE(NULLIF(q.client_address, ''), c.address, '') AS cliente_domicilio,
             COALESCE(NULLIF(q.client_phone, ''), c.phone, '') AS cliente_telefono,
             COALESCE(NULLIF(q.client_fiscal_condition, ''), c.fiscal_condition, '') AS cliente_cond_iva,
             COALESCE(NULLIF(q.client_document, ''), c.tax_id, '') AS cliente_cuit,
             q.total_amount::text AS total,
             q.active_price_list,
             q.validity_days,
             COALESCE(q.price_list_name, '') AS price_list_name,
             q.discount_percent::text,
             q.net_amount::text,
             q.discount_amount::text,
             q.subtotal_amount::text,
             q.include_vat,
             q.vat_rate::text,
             COALESCE(q.desired_document, '') AS desired_document,
             q.vat_amount::text,
             q.status AS estado,
             p.username AS creado_por,
             q.created_at::text,
             ((q.created_at::date + (q.validity_days || ' days')::interval)::date - CURRENT_DATE) AS dias_restantes,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', qi.product_id,
                   'name', qi.description,
                   'quantity', qi.quantity,
                   'unitPrice', qi.unit_price,
                   'discount', qi.discount,
                   'subtotal', qi.total_amount
                 )
                 ORDER BY qi.id
               ) FILTER (WHERE qi.id IS NOT NULL),
               '[]'::json
             ) AS productos_json
      FROM quotes q
      LEFT JOIN clients c ON c.id = q.client_id AND c.empresa_id = q.empresa_id
      LEFT JOIN profiles p ON p.id = q.seller_id
      LEFT JOIN quote_items qi ON qi.quote_id = q.id AND qi.empresa_id = q.empresa_id
      WHERE q.empresa_id = $1
        AND ($2 = '' OR q.status = $2)
      GROUP BY q.id, c.id, p.username
      ORDER BY q.created_at DESC, q.id DESC
    `,
    [companyId, status],
  );

  return result.rows.map(mapQuote);
}

export async function getQuote(companyId: number, id: string) {
  const result = await queryWithCompanyContext<Parameters<typeof mapQuote>[0]>(
    companyId,
    `
      SELECT q.id::text,
             q.client_id::text AS client_id,
             q.seller_id::text AS seller_id,
             q.visible_to_all,
             COALESCE(NULLIF(q.quote_number, ''), 'Sin numero') AS quote_number,
             q.created_at::date::text AS fecha_emision,
             (q.created_at::date + (q.validity_days || ' days')::interval)::date::text AS fecha_vencimiento,
             COALESCE(NULLIF(q.client_name, ''), c.display_name, c.legal_name, '') AS cliente_nombre,
             COALESCE(NULLIF(q.client_legal_name, ''), c.legal_name, c.display_name, '') AS cliente_razon_social,
             COALESCE(NULLIF(q.client_address, ''), c.address, '') AS cliente_domicilio,
             COALESCE(NULLIF(q.client_phone, ''), c.phone, '') AS cliente_telefono,
             COALESCE(NULLIF(q.client_fiscal_condition, ''), c.fiscal_condition, '') AS cliente_cond_iva,
             COALESCE(NULLIF(q.client_document, ''), c.tax_id, '') AS cliente_cuit,
             q.total_amount::text AS total,
             q.active_price_list,
             q.validity_days,
             COALESCE(q.price_list_name, '') AS price_list_name,
             q.discount_percent::text,
             q.net_amount::text,
             q.discount_amount::text,
             q.subtotal_amount::text,
             q.include_vat,
             q.vat_rate::text,
             COALESCE(q.desired_document, '') AS desired_document,
             q.vat_amount::text,
             q.status AS estado,
             p.username AS creado_por,
             q.created_at::text,
             ((q.created_at::date + (q.validity_days || ' days')::interval)::date - CURRENT_DATE) AS dias_restantes,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', qi.product_id,
                   'name', qi.description,
                   'quantity', qi.quantity,
                   'unitPrice', qi.unit_price,
                   'discount', qi.discount,
                   'subtotal', qi.total_amount
                 )
                 ORDER BY qi.id
               ) FILTER (WHERE qi.id IS NOT NULL),
               '[]'::json
             ) AS productos_json
      FROM quotes q
      LEFT JOIN clients c ON c.id = q.client_id AND c.empresa_id = q.empresa_id
      LEFT JOIN profiles p ON p.id = q.seller_id
      LEFT JOIN quote_items qi ON qi.quote_id = q.id AND qi.empresa_id = q.empresa_id
      WHERE q.empresa_id = $2
        AND (q.id::text = $1 OR q.quote_number = $1)
      GROUP BY q.id, c.id, p.username
    `,
    [id, companyId],
  );

  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Presupuesto no encontrado");
  return mapQuote(row);
}

async function resolveQuoteProductsFromCatalog(
  client: PoolClient,
  companyId: number,
  products: QuoteProduct[],
  priceListKey: PriceListKey,
  priceListName: string,
) {
  const productIds = products.map((product) => product.id);
  const quantities = products.map((product) => product.quantity);
  const discounts = products.map((product) => product.discount);
  const sortOrders = products.map((_, index) => index);
  const unitPriceExpression = dynamicPriceSqlExpression(priceListKey);

  const result = await client.query<{
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

  if (result.rowCount !== products.length) {
    throw new ApiError(400, "Uno o mas productos del presupuesto no existen o estan inactivos");
  }

  return result.rows.map((product) => {
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
}

export type QuoteDraft = {
  customer: {
    id: string;
    display_name: string;
    legal_name: string | null;
    tax_id: string | null;
    fiscal_condition: string | null;
    phone: string | null;
    address: string | null;
  };
  desiredDocument: SaleOrderDocument;
  vatRate: SaleVatRate;
  priceListKey: PriceListKey;
  priceListName: string;
  detail: {
    productId: string;
    description: string;
    quantity: number;
    discount: number;
    unitPrice: number;
    subtotal: number;
  }[];
  netAmount: number;
  discountAmount: number;
  subtotal: number;
  vatAmount: number;
  total: number;
};

export async function buildQuoteDraft(
  client: PoolClient,
  session: AuthSession,
  input: QuoteInput,
): Promise<QuoteDraft> {
  if (!input.customerId) {
    throw new ApiError(
      400,
      "Selecciona un cliente registrado con comprobante configurado para crear el presupuesto.",
    );
  }
  type QuoteClientRow = {
    id: string | null;
    display_name: string;
    legal_name: string | null;
    tax_id: string | null;
    fiscal_condition: string | null;
    phone: string | null;
    address: string | null;
    price_list_name: string | null;
    seller_name: string | null;
    receipt_type: string | null;
  };
  const customerResult = await client.query<QuoteClientRow>(
    `
      SELECT id::text, display_name, legal_name, tax_id, fiscal_condition,
             phone, address, price_list_name, seller_name, receipt_type
      FROM clients
      WHERE id = $1::uuid AND empresa_id = $2
      LIMIT 1
    `,
    [input.customerId, session.companyId],
  );
  const customer = customerResult.rows[0];
  if (!customer) throw new ApiError(404, "Cliente no encontrado");
  await reactivateClientIfInactive(client, session.companyId, input.customerId);
  const desiredDocument = saleOrderDocument(customer.receipt_type);
  const vatRate = saleVatRateForDocument(customer.receipt_type);
  if (!desiredDocument || !vatRate) {
    throw new ApiError(
      400,
      "El cliente no tiene un comprobante valido. Configuralo como Remito, Factura A o Factura B antes de crear el presupuesto.",
    );
  }
  const activePriceLists = await getActivePriceListNames(client, session.companyId);
  const priceListName = resolvePriceListName(
    input.priceListOverride || customer.price_list_name || priceListNameFromNumber(input.activePriceList),
    activePriceLists,
  );
  const priceListKey = normalizePriceListKey(priceListName);
  const allProductsHaveIds = input.products.every((product) => Boolean(product.id));
  const detail = allProductsHaveIds
    ? await resolveQuoteProductsFromCatalog(client, session.companyId, input.products, priceListKey, priceListName)
    : input.products.map((product) => {
        const unitPrice = money(Number(product.unitPrice ?? 0));
        if (unitPrice <= 0) {
          throw new ApiError(400, `El producto ${product.name || product.id || ""} no tiene precio`);
        }
        return {
          productId: product.id,
          description: product.name || `Producto ${product.id || ""}`.trim(),
          quantity: product.quantity,
          discount: product.discount,
          unitPrice,
          subtotal: lineSubtotal(unitPrice, product.quantity, product.discount),
        };
      });
  const netAmount = money(detail.reduce((sum, product) => sum + product.subtotal, 0));
  const discountAmount = money((netAmount * input.discountPercent) / 100);
  const subtotal = money(netAmount - discountAmount);
  const calculatedTotals = vatAmountsFromNet(subtotal, vatRate);
  const vatAmount = calculatedTotals.vat;
  const total = calculatedTotals.total;
  if (total <= 0) throw new ApiError(400, "El presupuesto no tiene importe calculable");
  return {
    customer: {
      id: customer.id ?? input.customerId,
      display_name: customer.display_name,
      legal_name: customer.legal_name,
      tax_id: customer.tax_id,
      fiscal_condition: customer.fiscal_condition,
      phone: customer.phone,
      address: customer.address,
    },
    desiredDocument,
    vatRate,
    priceListKey,
    priceListName,
    detail,
    netAmount,
    discountAmount,
    subtotal,
    vatAmount,
    total,
  };
}

export async function createQuote(session: AuthSession, input: QuoteInput) {
  const quoteId = await withCompanyContext(session.companyId, async (client) => {
    const draft = await buildQuoteDraft(client, session, input);

    await client.query("SELECT pg_advisory_xact_lock(83011, $1::int)", [session.companyId]);
    const sequence = await client.query<{ value: string }>(
      `
        SELECT (COALESCE(MAX(substring(quote_number FROM '^P-([0-9]+)$')::bigint), 0) + 1)::text AS value
        FROM quotes
        WHERE empresa_id = $1 AND quote_number ~ '^P-[0-9]+$'
      `,
      [session.companyId],
    );
    const commercialNumber = Number(sequence.rows[0]?.value ?? 1);
    const quoteNumber = `P-${String(commercialNumber).padStart(4, "0")}`;

    const quoteResult = await client.query<{ id: string }>(
      `
        INSERT INTO quotes (
          quote_number, client_id, seller_id, status, total_amount,
          validity_days, include_vat, vat_rate, desired_document, active_price_list, price_list_name, discount_percent,
          net_amount, discount_amount, subtotal_amount, vat_amount,
          client_name, client_legal_name, client_document, client_fiscal_condition,
          client_phone, client_address, empresa_id
        )
        VALUES (
          $1, $2::uuid, $3::uuid, 'pendiente', $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
        RETURNING id::text
      `,
      [
        quoteNumber,
        draft.customer.id,
        session.userId,
        draft.total,
        input.validityDays,
        true,
        draft.vatRate,
        draft.desiredDocument,
        priceListNumber(draft.priceListKey),
        draft.priceListName,
        input.discountPercent,
        draft.netAmount,
        draft.discountAmount,
        draft.subtotal,
        draft.vatAmount,
        draft.customer.display_name,
        draft.customer.legal_name ?? "",
        draft.customer.tax_id ?? "",
        draft.customer.fiscal_condition ?? "",
        draft.customer.phone ?? "",
        draft.customer.address ?? "",
        session.companyId,
      ],
    );
    const newQuoteId = quoteResult.rows[0].id;

    for (const product of draft.detail) {
      await client.query(
        `
          INSERT INTO quote_items (
            quote_id, product_id, description, quantity, unit_price, discount, total_amount, empresa_id
          )
          VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8)
        `,
        [
          newQuoteId,
          product.productId,
          product.description,
          product.quantity,
          product.unitPrice,
          product.discount,
          product.subtotal,
          session.companyId,
        ],
      );
    }
    return newQuoteId;
  });

  clearReadQueryCache();
  return getQuote(session.companyId, quoteId);
}

export async function updateQuote(session: AuthSession, id: string, input: QuoteInput) {
  const quoteId = await withCompanyContext(session.companyId, async (client) => {
    const existing = await client.query<{ id: string; status: string }>(
      `
        SELECT q.id::text, q.status
        FROM quotes q
        WHERE q.id = $1::uuid AND q.empresa_id = $2
        FOR UPDATE OF q
      `,
      [id, session.companyId],
    );
    const quote = existing.rows[0];
    if (!quote) throw new ApiError(404, "Presupuesto no encontrado");
    if (quote.status !== "pendiente") {
      throw new ApiError(409, "Solo se pueden editar presupuestos pendientes");
    }

    const draft = await buildQuoteDraft(client, session, input);

    await client.query(
      `
        UPDATE quotes
        SET client_id = $1::uuid,
            total_amount = $2,
            validity_days = $3,
            include_vat = $4,
            vat_rate = $5,
            desired_document = $6,
            active_price_list = $7,
            price_list_name = $8,
            discount_percent = $9,
            net_amount = $10,
            discount_amount = $11,
            subtotal_amount = $12,
            vat_amount = $13,
            client_name = $14,
            client_legal_name = $15,
            client_document = $16,
            client_fiscal_condition = $17,
            client_phone = $18,
            client_address = $19,
            updated_at = NOW()
        WHERE id = $20::uuid AND empresa_id = $21
      `,
      [
        draft.customer.id,
        draft.total,
        input.validityDays,
        true,
        draft.vatRate,
        draft.desiredDocument,
        priceListNumber(draft.priceListKey),
        draft.priceListName,
        input.discountPercent,
        draft.netAmount,
        draft.discountAmount,
        draft.subtotal,
        draft.vatAmount,
        draft.customer.display_name,
        draft.customer.legal_name ?? "",
        draft.customer.tax_id ?? "",
        draft.customer.fiscal_condition ?? "",
        draft.customer.phone ?? "",
        draft.customer.address ?? "",
        id,
        session.companyId,
      ],
    );

    await client.query(`DELETE FROM quote_items WHERE quote_id = $1::uuid AND empresa_id = $2`, [id, session.companyId]);

    for (const product of draft.detail) {
      await client.query(
        `
          INSERT INTO quote_items (
            quote_id, product_id, description, quantity, unit_price, discount, total_amount, empresa_id
          )
          VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8)
        `,
        [id, product.productId, product.description, product.quantity, product.unitPrice, product.discount, product.subtotal, session.companyId],
      );
    }
    return id;
  });

  clearReadQueryCache();
  return getQuote(session.companyId, quoteId);
}

export async function acceptQuote(
  session: AuthSession,
  id: string,
  options: { requestFiscalInvoice?: boolean } = {},
) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const quoteResult = await client.query<{
      id: string;
      quote_number: string;
      client_id: string | null;
      seller_id: string | null;
      status: string;
      total_amount: string;
      subtotal_amount: string;
      vat_rate: string;
      desired_document: string;
      active_price_list: number;
      price_list_name: string | null;
      converted_order_id: string | null;
      client_name: string | null;
      client_legal_name: string | null;
      client_document: string | null;
      client_fiscal_condition: string | null;
      client_phone: string | null;
      client_address: string | null;
      seller_name: string | null;
    }>(
      `
        SELECT q.id::text,
               COALESCE(NULLIF(q.quote_number, ''), 'Sin numero') AS quote_number,
               q.client_id::text,
               q.seller_id::text,
               q.status,
               q.total_amount::text,
               q.subtotal_amount::text,
               q.vat_rate::text,
               COALESCE(q.desired_document, '') AS desired_document,
               q.active_price_list,
               COALESCE(q.price_list_name, '') AS price_list_name,
               q.converted_order_id::text,
               COALESCE(NULLIF(q.client_name, ''), c.display_name, c.legal_name, '') AS client_name,
               COALESCE(NULLIF(q.client_legal_name, ''), c.legal_name, c.display_name, '') AS client_legal_name,
               COALESCE(NULLIF(q.client_document, ''), c.tax_id, '') AS client_document,
               COALESCE(NULLIF(q.client_fiscal_condition, ''), c.fiscal_condition, '') AS client_fiscal_condition,
               COALESCE(NULLIF(q.client_phone, ''), c.phone, '') AS client_phone,
               COALESCE(NULLIF(q.client_address, ''), c.address, '') AS client_address,
               COALESCE(p.username, p.full_name, '') AS seller_name
        FROM quotes q
        LEFT JOIN clients c ON c.id = q.client_id AND c.empresa_id = q.empresa_id
        LEFT JOIN profiles p ON p.id = q.seller_id
        WHERE q.id = $1::uuid AND q.empresa_id = $2
        FOR UPDATE OF q
      `,
      [id, session.companyId],
    );
    const quote = quoteResult.rows[0];
    if (!quote) throw new ApiError(404, "Presupuesto no encontrado");

    if (quote.converted_order_id) {
      return {
        quoteId: quote.id,
        orderId: quote.converted_order_id,
        remittanceId: null,
        remittanceNumber: null,
        fiscalRequested: false,
      };
    }
    if (quote.status !== "pendiente") {
      throw new ApiError(409, "El presupuesto ya no esta pendiente o no puede aceptarse");
    }
    const snapshot = acceptedQuoteVatSnapshot({
      desiredDocument: quote.desired_document,
      vatRate: quote.vat_rate,
      subtotalAmount: quote.subtotal_amount,
      totalAmount: quote.total_amount,
    });
    if (!quote.client_id) {
      throw new ApiError(
        409,
        "El presupuesto no tiene un cliente registrado asociado y no puede convertirse automaticamente.",
      );
    }

    const items = await client.query<{
      product_id: string | null;
      description: string | null;
      quantity: string;
      unit_price: string;
      discount: string;
      total_amount: string;
    }>(
      `
        SELECT product_id::text,
               description,
               quantity::text,
               unit_price::text,
               discount::text,
               total_amount::text
        FROM quote_items
        WHERE quote_id = $1::uuid AND empresa_id = $2
        ORDER BY id ASC
      `,
      [id, session.companyId],
    );
    if (!items.rowCount) throw new ApiError(400, "El presupuesto no tiene items para convertir");

    await client.query("SELECT pg_advisory_xact_lock(83010, $1::int)", [session.companyId]);
    const sequence = await client.query<{ value: string }>(
      `
        SELECT (COALESCE(MAX(commercial_number), 0) + 1)::text AS value
        FROM sales
        WHERE empresa_id = $1
      `,
      [session.companyId],
    );
    const commercialNumber = Number(sequence.rows[0]?.value ?? 1);
    const receiptNumber = commercialNumber;
    const saleNumber = `P-${String(commercialNumber).padStart(4, "0")}`;
    const isFiscalDocument = snapshot.desiredDocument === "factura_a" || snapshot.desiredDocument === "factura_b";
    if (options.requestFiscalInvoice && !isFiscalDocument) {
      throw new ApiError(400, "El comprobante asociado al cliente es Remito y no permite solicitar factura fiscal.");
    }
    if (
      options.requestFiscalInvoice
      && !hasFiscalCustomerData(quote.client_document ?? "", quote.client_fiscal_condition ?? "")
    ) {
      throw new ApiError(400, "El cliente no tiene CUIT y condicion fiscal completos para solicitar factura.");
    }
    const fiscalRequested = Boolean(options.requestFiscalInvoice) && isFiscalDocument;
    const desiredDocument = snapshot.desiredDocument;
    const priceList = quote.price_list_name || priceListNameFromNumber(quote.active_price_list);
    const receiptType = receiptTypeCode(desiredDocument);

    const clientId = quote.client_id;
    await reactivateClientIfInactive(client, session.companyId, clientId);

    const saleResult = await client.query<{ id: string }>(
      `
        INSERT INTO sales (
          sale_number, commercial_number, client_id, seller_id, client_name, client_document, price_list_name,
          total_amount, vat_rate, receipt_number, receipt_type, payment_condition, sale_date, seller_name,
          collection_status, order_status, desired_document, notes,
          stock_discounted, status, empresa_id
        )
        VALUES (
          $1, $2, $3::uuid, $4::uuid, $5, $6, $7,
          $8, $9, $10, $11, 'pendiente', CURRENT_DATE, $12,
          'no_aplica', 'cargado', $13, $14,
          false, 'cargado', $15
        )
        RETURNING id::text
      `,
      [
        saleNumber,
        commercialNumber,
        clientId,
        quote.seller_id ?? session.userId,
        quote.client_name,
        quote.client_document,
        priceList,
        Number(quote.total_amount),
        snapshot.vatRate,
        receiptNumber,
        receiptType,
        quote.seller_name || session.username,
        desiredDocument,
        `Convertido desde presupuesto ${quote.quote_number}`,
        session.companyId,
      ],
    );
    const orderId = saleResult.rows[0].id;

    for (const item of items.rows) {
      await client.query(
        `
          INSERT INTO sale_items (
            sale_id, product_id, description, quantity, unit_price, discount, total_amount, empresa_id
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
        `,
        [
          orderId,
          item.product_id,
          item.description,
          Number(item.quantity),
          Number(item.unit_price),
          Number(item.discount),
          Number(item.total_amount),
          session.companyId,
        ],
      );
    }

    const commercialRemittance = await createCommercialRemittanceForSale(client, session, orderId);

    await client.query(
      `
        UPDATE quotes
        SET status = 'aceptada',
            approved_at = NOW(),
            converted_order_id = $1::uuid,
            client_id = $4::uuid,
            updated_at = NOW()
        WHERE id = $2::uuid AND empresa_id = $3
      `,
      [orderId, id, session.companyId, clientId],
    );

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "presupuesto.convertido",
        JSON.stringify({
          quoteId: id,
          orderId,
          remittanceId: commercialRemittance.id,
          remittanceNumber: commercialRemittance.number,
          fiscalRequested,
          usuario: session.username,
        }),
        session.companyId,
      ],
    );

    return {
      quoteId: id,
      orderId,
      remittanceId: commercialRemittance.id,
      remittanceNumber: commercialRemittance.number,
      fiscalRequested,
    };
  });

  clearReadQueryCache();
  return {
    id: result.quoteId,
    orderId: result.orderId,
    remittanceId: result.remittanceId,
    remittanceNumber: result.remittanceNumber,
    fiscalRequested: result.fiscalRequested,
    redirect: `/orders?status=cargado`,
  };
}

export async function deleteQuote(companyId: number, id: string) {
  await withCompanyContext(companyId, async (client) => {
    const existing = await client.query<{ id: string; status: string; converted_order_id: string | null }>(
      `
        SELECT id::text, status, converted_order_id::text
        FROM quotes
        WHERE id = $1::uuid AND empresa_id = $2
        FOR UPDATE
      `,
      [id, companyId],
    );
    const quote = existing.rows[0];
    if (!quote) throw new ApiError(404, "Presupuesto no encontrado");
    if (quote.converted_order_id || (quote.status !== "pendiente" && quote.status !== "rechazada")) {
      throw new ApiError(409, "No se puede eliminar un presupuesto aceptado");
    }
    await client.query(`DELETE FROM quote_items WHERE quote_id = $1::uuid AND empresa_id = $2`, [id, companyId]);
    await client.query(`DELETE FROM quotes WHERE id = $1::uuid AND empresa_id = $2`, [id, companyId]);
  });
  clearReadQueryCache();
  return { id };
}
