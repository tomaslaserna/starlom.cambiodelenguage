import type { PoolClient } from "pg";
import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { lineSubtotal, money, normalizePriceListKey, type PriceListKey } from "@/lib/order-pricing";
import { priceSqlExpression, productMarginCodeExpression } from "@/lib/product-pricing-sql";
import {
  normalizeOrderCreationDocument,
  receiptAddsVat,
  receiptTypeCode,
} from "@/lib/receipt-types";
import { intField, numberField, textField, uuidParam, type RequestBody } from "@/lib/request-body";
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
  includeVat: boolean | null;
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

function nestedUuid(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      return value;
    }
  }
  return "";
}

function booleanField(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "si", "on", "yes"].includes(normalized)) return true;
  return fallback;
}

function optionalBooleanField(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return booleanField(value, true);
}

function priceListNumber(key: PriceListKey) {
  return key === "rev" ? 5 : Number(key);
}

function priceListNameFromNumber(value: number) {
  if (value === 5) return "REVENDEDOR";
  return value > 0 ? `PRECIO ${value}` : "";
}

export function quoteInputFromBody(body: RequestBody): QuoteInput {
  const customerBody = objectValue(body.customer ?? body.cliente);
  const rawCustomerId = textField(body, "customerId") || textField(body, "id_cliente");
  const customerId = rawCustomerId ? uuidParam(rawCustomerId, "Cliente") : "";
  const customer = {
    name: nestedText(customerBody, "name") || nestedText(customerBody, "nombre"),
    businessName:
      nestedText(customerBody, "businessName") || nestedText(customerBody, "razon_social"),
    address: nestedText(customerBody, "address") || nestedText(customerBody, "domicilio"),
    phone: nestedText(customerBody, "phone") || nestedText(customerBody, "telefono"),
    vatCondition:
      nestedText(customerBody, "vatCondition") || nestedText(customerBody, "cond_iva"),
    taxId: nestedText(customerBody, "taxId") || nestedText(customerBody, "cuit"),
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
    const quantity = Math.max(0.001, nestedNumber(product, ["quantity", "cantidad"], 1));
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
    includeVat: optionalBooleanField(body.includeVat ?? body.incluir_iva),
    activePriceList: intField(body, "activePriceList", intField(body, "lista_activa", 0)),
    priceListOverride: textField(body, "priceListOverride") || textField(body, "lista_precios"),
    validityDays: clamp(intField(body, "validityDays", intField(body, "vigencia_dias", 15)), 1, 365),
  };
}

function mapQuote(row: {
  id: string;
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
  discount_percent: string;
  include_vat: boolean;
  net_amount: string;
  discount_amount: string;
  subtotal_amount: string;
  vat_amount: string;
  productos_json?: unknown;
  estado: string;
  creado_por: string | null;
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
    discountPercent: Number(row.discount_percent),
    includeVat: row.include_vat,
    netAmount: Number(row.net_amount),
    discountAmount: Number(row.discount_amount),
    subtotal: Number(row.subtotal_amount),
    vatAmount: Number(row.vat_amount),
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
             COALESCE(q.quote_number, q.id::text) AS quote_number,
             q.created_at::date::text AS fecha_emision,
             (q.created_at::date + (q.validity_days || ' days')::interval)::date::text AS fecha_vencimiento,
             c.display_name AS cliente_nombre,
             c.legal_name AS cliente_razon_social,
             c.address AS cliente_domicilio,
             c.phone AS cliente_telefono,
             c.fiscal_condition AS cliente_cond_iva,
             c.tax_id AS cliente_cuit,
             q.total_amount::text AS total,
             q.active_price_list,
             q.discount_percent::text,
             q.include_vat,
             q.net_amount::text,
             q.discount_amount::text,
             q.subtotal_amount::text,
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
             COALESCE(q.quote_number, q.id::text) AS quote_number,
             q.created_at::date::text AS fecha_emision,
             (q.created_at::date + (q.validity_days || ' days')::interval)::date::text AS fecha_vencimiento,
             c.display_name AS cliente_nombre,
             c.legal_name AS cliente_razon_social,
             c.address AS cliente_domicilio,
             c.phone AS cliente_telefono,
             c.fiscal_condition AS cliente_cond_iva,
             c.tax_id AS cliente_cuit,
             q.total_amount::text AS total,
             q.active_price_list,
             q.discount_percent::text,
             q.include_vat,
             q.net_amount::text,
             q.discount_amount::text,
             q.subtotal_amount::text,
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
      WHERE q.id = $1::uuid AND q.empresa_id = $2
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
) {
  const productIds = products.map((product) => product.id);
  const quantities = products.map((product) => product.quantity);
  const discounts = products.map((product) => product.discount);
  const sortOrders = products.map((_, index) => index);
  const unitPriceExpression = priceSqlExpression(priceListKey);

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
      ORDER BY request.sort_order ASC
    `,
    [productIds, quantities, discounts, sortOrders, companyId],
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

export async function createQuote(session: AuthSession, input: QuoteInput) {
  if (!input.customerId && !input.customer.name && !input.customer.businessName) {
    throw new ApiError(400, "Completa el cliente del presupuesto");
  }

  const quoteId = await withCompanyContext(session.companyId, async (client) => {
    type QuoteClientRow = {
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
    };

    let customer: QuoteClientRow | undefined;
    if (input.customerId) {
      const customerResult = await client.query<QuoteClientRow>(
        `
          SELECT id::text, display_name, legal_name, tax_id, fiscal_condition,
                 phone, address, price_list_name, receipt_type, seller_name
          FROM clients
          WHERE id = $1::uuid AND empresa_id = $2 AND active = true
          LIMIT 1
        `,
        [input.customerId, session.companyId],
      );
      customer = customerResult.rows[0];
      if (!customer) throw new ApiError(404, "Cliente no encontrado");
    } else {
      const clientResult = await client.query<QuoteClientRow>(
        `
          INSERT INTO clients (
            display_name, legal_name, tax_id, fiscal_condition, phone, address, empresa_id
          )
          VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7)
          ON CONFLICT DO NOTHING
          RETURNING id::text, display_name, legal_name, tax_id, fiscal_condition,
                    phone, address, price_list_name, receipt_type, seller_name
        `,
        [
          input.customer.name || input.customer.businessName,
          input.customer.businessName || input.customer.name,
          input.customer.taxId,
          input.customer.vatCondition,
          input.customer.phone,
          input.customer.address,
          session.companyId,
        ],
      );
      customer = clientResult.rows[0];

      if (!customer && input.customer.taxId) {
        const existing = await client.query<QuoteClientRow>(
          `
            SELECT id::text, display_name, legal_name, tax_id, fiscal_condition,
                   phone, address, price_list_name, receipt_type, seller_name
            FROM clients
            WHERE empresa_id = $1 AND tax_id = $2
            LIMIT 1
          `,
          [session.companyId, input.customer.taxId],
        );
        customer = existing.rows[0];
      }
    }

    if (!customer) throw new ApiError(400, "No se pudo resolver el cliente del presupuesto");

    const priceListName =
      input.priceListOverride || customer.price_list_name || priceListNameFromNumber(input.activePriceList) || "PRECIO 1";
    const priceListKey = normalizePriceListKey(priceListName);
    const desiredDocument = normalizeOrderCreationDocument(
      customer.receipt_type ?? "",
      customer.fiscal_condition ?? "",
    );
    const includeVat = input.includeVat ?? receiptAddsVat(desiredDocument);
    const allProductsHaveIds = input.products.every((product) => Boolean(product.id));
    const detail = allProductsHaveIds
      ? await resolveQuoteProductsFromCatalog(client, session.companyId, input.products, priceListKey)
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
    const vatAmount = includeVat ? money(subtotal * 0.21) : 0;
    const total = money(subtotal + vatAmount);
    if (total <= 0) throw new ApiError(400, "El presupuesto no tiene importe calculable");

    const quoteResult = await client.query<{ id: string }>(
      `
        INSERT INTO quotes (
          quote_number, client_id, seller_id, status, total_amount,
          validity_days, include_vat, active_price_list, discount_percent,
          net_amount, discount_amount, subtotal_amount, vat_amount, empresa_id
        )
        VALUES (
          'P-' || to_char(NOW(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6)),
          $1::uuid,
          $2::uuid,
          'pendiente',
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )
        RETURNING id::text
      `,
      [
        customer.id,
        session.userId,
        total,
        input.validityDays,
        includeVat,
        priceListNumber(priceListKey),
        input.discountPercent,
        netAmount,
        discountAmount,
        subtotal,
        vatAmount,
        session.companyId,
      ],
    );
    const newQuoteId = quoteResult.rows[0].id;

    for (const product of detail) {
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

export async function acceptQuote(session: AuthSession, id: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const quoteResult = await client.query<{
      id: string;
      client_id: string | null;
      seller_id: string | null;
      status: string;
      total_amount: string;
      subtotal_amount: string;
      vat_amount: string;
      active_price_list: number;
      converted_order_id: string | null;
      client_name: string | null;
      client_document: string | null;
      seller_name: string | null;
    }>(
      `
        SELECT q.id::text,
               q.client_id::text,
               q.seller_id::text,
               q.status,
               q.total_amount::text,
               q.subtotal_amount::text,
               q.vat_amount::text,
               q.active_price_list,
               q.converted_order_id::text,
               COALESCE(c.display_name, c.legal_name, '') AS client_name,
               COALESCE(c.tax_id, '') AS client_document,
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
      return { quoteId: quote.id, orderId: quote.converted_order_id };
    }
    if (quote.status !== "pendiente") {
      throw new ApiError(409, "El presupuesto ya no esta pendiente o no puede aceptarse");
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
      "SELECT (COALESCE(MAX(receipt_number), 0) + 1)::text AS value FROM sales WHERE empresa_id = $1",
      [session.companyId],
    );
    const receiptNumber = Number(sequence.rows[0]?.value ?? 0);
    const saleNumber = `P-${String(receiptNumber).padStart(6, "0")}`;
    const desiredDocument = "remito";
    const priceList = priceListNameFromNumber(quote.active_price_list);
    const receiptType = receiptTypeCode(desiredDocument);

    const saleResult = await client.query<{ id: string }>(
      `
        INSERT INTO sales (
          sale_number, client_id, seller_id, client_name, client_document, price_list_name,
          total_amount, receipt_number, receipt_type, payment_condition, sale_date, seller_name,
          collection_status, order_status, desired_document, notes,
          stock_discounted, status, empresa_id
        )
        VALUES (
          $1, $2::uuid, $3::uuid, $4, $5, $6,
          $7, $8, $9, 'pendiente', CURRENT_DATE, $10,
          'no_aplica', 'cargado', $11, $12,
          false, 'cargado', $13
        )
        RETURNING id::text
      `,
      [
        saleNumber,
        quote.client_id,
        quote.seller_id ?? session.userId,
        quote.client_name,
        quote.client_document,
        priceList,
        Number(quote.total_amount),
        receiptNumber,
        receiptType,
        quote.seller_name || session.username,
        desiredDocument,
        `Convertido desde presupuesto ${id}`,
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

    await client.query(
      `
        UPDATE quotes
        SET status = 'aceptada',
            approved_at = NOW(),
            converted_order_id = $1::uuid,
            updated_at = NOW()
        WHERE id = $2::uuid AND empresa_id = $3
      `,
      [orderId, id, session.companyId],
    );

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "presupuesto.convertido",
        JSON.stringify({ quoteId: id, orderId, usuario: session.username }),
        session.companyId,
      ],
    );

    return { quoteId: id, orderId };
  });

  clearReadQueryCache();
  return { id: result.quoteId, orderId: result.orderId, redirect: `/orders?status=cargado` };
}

export async function deleteQuote(companyId: number, id: string) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    "DELETE FROM quotes WHERE id = $1::uuid AND empresa_id = $2 RETURNING id::text",
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Presupuesto no encontrado");
  return { id };
}
