import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { intField, numberField, type RequestBody } from "@/lib/request-body";
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
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  netUnitPrice: number;
  subtotal: number;
};

type QuoteInput = {
  customer: QuoteCustomer;
  products: QuoteProduct[];
  discountPercent: number;
  includeVat: boolean;
  activePriceList: number;
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

export function quoteInputFromBody(body: RequestBody): QuoteInput {
  const customerBody = objectValue(body.customer ?? body.cliente);
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

  const products = arrayValue(body.products ?? body.productos).map((raw) => {
    const product = objectValue(raw);
    const quantity = Math.max(0.001, nestedNumber(product, ["quantity", "cantidad"], 1));
    const unitPrice = nestedNumber(product, ["unitPrice", "precio_unit"], 0);
    const discount = clamp(nestedNumber(product, ["discount", "bonif"], 0), 0, 100);
    const netUnitPrice = unitPrice * (1 - discount / 100);
    return {
      id: Math.trunc(nestedNumber(product, ["id", "productId", "id_producto"], 0)),
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
    customer,
    products,
    discountPercent: clamp(numberField(body, "discountPercent", numberField(body, "descuento", 0)), 0, 100),
    includeVat:
      body.includeVat === undefined
        ? body.incluir_iva === undefined
          ? true
          : Boolean(body.incluir_iva)
        : Boolean(body.includeVat),
    activePriceList: intField(body, "activePriceList", intField(body, "lista_activa", 0)),
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
    activePriceList: 0,
    discountPercent: 0,
    includeVat: true,
    netAmount: Number(row.total),
    discountAmount: 0,
    subtotal: Number(row.total),
    vatAmount: 0,
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
             (q.created_at::date + INTERVAL '15 days')::date::text AS fecha_vencimiento,
             c.display_name AS cliente_nombre,
             c.legal_name AS cliente_razon_social,
             c.address AS cliente_domicilio,
             c.phone AS cliente_telefono,
             c.fiscal_condition AS cliente_cond_iva,
             c.tax_id AS cliente_cuit,
             q.total_amount::text AS total,
             q.status AS estado,
             p.username AS creado_por,
             q.created_at::text,
             ((q.created_at::date + INTERVAL '15 days')::date - CURRENT_DATE) AS dias_restantes,
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
             (q.created_at::date + INTERVAL '15 days')::date::text AS fecha_vencimiento,
             c.display_name AS cliente_nombre,
             c.legal_name AS cliente_razon_social,
             c.address AS cliente_domicilio,
             c.phone AS cliente_telefono,
             c.fiscal_condition AS cliente_cond_iva,
             c.tax_id AS cliente_cuit,
             q.total_amount::text AS total,
             q.status AS estado,
             p.username AS creado_por,
             q.created_at::text,
             ((q.created_at::date + INTERVAL '15 days')::date - CURRENT_DATE) AS dias_restantes,
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

export async function createQuote(session: AuthSession, input: QuoteInput) {
  if (!input.customer.name && !input.customer.businessName) {
    throw new ApiError(400, "Completa el cliente del presupuesto");
  }
  const netAmount = Number(input.products.reduce((sum, product) => sum + product.subtotal, 0).toFixed(2));
  const discountAmount = Number((netAmount * input.discountPercent / 100).toFixed(2));
  const subtotal = Number((netAmount - discountAmount).toFixed(2));
  const vatAmount = input.includeVat ? Number((subtotal * 0.21).toFixed(2)) : 0;
  const total = Number((subtotal + vatAmount).toFixed(2));

  const quoteId = await withCompanyContext(session.companyId, async (client) => {
    const clientResult = await client.query<{ id: string }>(
      `
        INSERT INTO clients (
          display_name, legal_name, tax_id, fiscal_condition, phone, address, empresa_id
        )
        VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
        RETURNING id::text
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
    let clientId = clientResult.rows[0]?.id;

    if (!clientId && input.customer.taxId) {
      const existing = await client.query<{ id: string }>(
        "SELECT id::text FROM clients WHERE empresa_id = $1 AND tax_id = $2 LIMIT 1",
        [session.companyId, input.customer.taxId],
      );
      clientId = existing.rows[0]?.id;
    }

    const quoteResult = await client.query<{ id: string }>(
      `
        INSERT INTO quotes (quote_number, client_id, seller_id, status, total_amount, empresa_id)
        VALUES (
          'P-' || to_char(NOW(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6)),
          $1::uuid,
          $2::uuid,
          'pendiente',
          $3,
          $4
        )
        RETURNING id::text
      `,
      [clientId, session.userId, total, session.companyId],
    );
    const newQuoteId = quoteResult.rows[0].id;

    for (const product of input.products) {
      await client.query(
        `
          INSERT INTO quote_items (
            quote_id, product_id, description, quantity, unit_price, discount, total_amount, empresa_id
          )
          VALUES ($1::uuid, NULL, $2, $3, $4, $5, $6, $7)
        `,
        [
          newQuoteId,
          product.name || `Producto ${product.id || ""}`.trim(),
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

export async function acceptQuote(companyId: number, id: string) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      UPDATE quotes
      SET status = 'aceptada',
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $1::uuid
        AND empresa_id = $2
        AND status = 'pendiente'
      RETURNING id::text
    `,
    [id, companyId],
  );
  if (result.rowCount !== 1 || !result.rows[0]) {
    throw new ApiError(409, "El presupuesto ya no esta pendiente o no puede aceptarse");
  }
  return { id, redirect: `/orders/new?quoteId=${id}` };
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
