import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
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
  id: number;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  cliente_nombre: string;
  cliente_razon_social: string;
  cliente_domicilio: string;
  cliente_telefono: string;
  cliente_cond_iva: string;
  cliente_cuit: string;
  lista_activa: number;
  descuento_pct: string;
  incluir_iva: number;
  neto_agravado: string;
  desc_monto: string;
  subtotal: string;
  iva_monto: string;
  total: string;
  productos_json?: string;
  estado: string;
  creado_por: string;
  created_at?: string;
  dias_restantes?: number;
}) {
  return {
    id: row.id,
    issueDate: row.fecha_emision,
    expirationDate: row.fecha_vencimiento,
    customer: {
      name: row.cliente_nombre,
      businessName: row.cliente_razon_social,
      address: row.cliente_domicilio,
      phone: row.cliente_telefono,
      vatCondition: row.cliente_cond_iva,
      taxId: row.cliente_cuit,
    },
    activePriceList: row.lista_activa,
    discountPercent: Number(row.descuento_pct),
    includeVat: Number(row.incluir_iva) === 1,
    netAmount: Number(row.neto_agravado),
    discountAmount: Number(row.desc_monto),
    subtotal: Number(row.subtotal),
    vatAmount: Number(row.iva_monto),
    total: Number(row.total),
    products: row.productos_json ? JSON.parse(row.productos_json) : undefined,
    status: row.estado,
    createdBy: row.creado_por,
    createdAt: row.created_at,
    daysRemaining: row.dias_restantes,
    valid: row.dias_restantes === undefined ? undefined : row.dias_restantes >= 0,
  };
}

export async function listQuotes(companyId: number, status = "pendiente") {
  const result = await queryWithCompanyContext<Parameters<typeof mapQuote>[0]>(
    companyId,
    `
      SELECT id, fecha_emision::text, fecha_vencimiento::text, cliente_nombre,
             cliente_razon_social, cliente_domicilio, cliente_telefono,
             cliente_cond_iva, cliente_cuit, lista_activa, descuento_pct::text,
             incluir_iva, neto_agravado::text, desc_monto::text, subtotal::text,
             iva_monto::text, total::text, estado, creado_por, created_at::text,
             (fecha_vencimiento - CURRENT_DATE) AS dias_restantes
      FROM presupuestos
      WHERE empresa_id = $1
        AND ($2 = '' OR estado = $2)
      ORDER BY fecha_vencimiento DESC, id DESC
    `,
    [companyId, status],
  );

  return result.rows.map(mapQuote);
}

export async function getQuote(companyId: number, id: number) {
  const result = await queryWithCompanyContext<Parameters<typeof mapQuote>[0]>(
    companyId,
    `
      SELECT id, fecha_emision::text, fecha_vencimiento::text, cliente_nombre,
             cliente_razon_social, cliente_domicilio, cliente_telefono,
             cliente_cond_iva, cliente_cuit, lista_activa, descuento_pct::text,
             incluir_iva, neto_agravado::text, desc_monto::text, subtotal::text,
             iva_monto::text, total::text, productos_json, estado, creado_por, created_at::text,
             (fecha_vencimiento - CURRENT_DATE) AS dias_restantes
      FROM presupuestos
      WHERE id = $1 AND empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );

  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Presupuesto no encontrado");
  return mapQuote(row);
}

export async function createQuote(session: AuthSession, input: QuoteInput) {
  const netAmount = Number(input.products.reduce((sum, product) => sum + product.subtotal, 0).toFixed(2));
  const discountAmount = Number((netAmount * input.discountPercent / 100).toFixed(2));
  const subtotal = Number((netAmount - discountAmount).toFixed(2));
  const vatAmount = input.includeVat ? Number((subtotal * 0.21).toFixed(2)) : 0;
  const total = Number((subtotal + vatAmount).toFixed(2));

  const result = await queryWithCompanyContext<{ id: number }>(
    session.companyId,
    `
      INSERT INTO presupuestos (
        fecha_emision, fecha_vencimiento, cliente_nombre, cliente_razon_social,
        cliente_domicilio, cliente_telefono, cliente_cond_iva, cliente_cuit,
        lista_activa, descuento_pct, incluir_iva, neto_agravado, desc_monto,
        subtotal, iva_monto, total, productos_json, creado_por, empresa_id
      )
      VALUES (
        CURRENT_DATE, CURRENT_DATE + ($1 || ' days')::interval, $2, $3,
        $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      RETURNING id
    `,
    [
      input.validityDays,
      input.customer.name,
      input.customer.businessName,
      input.customer.address,
      input.customer.phone,
      input.customer.vatCondition,
      input.customer.taxId,
      input.activePriceList,
      input.discountPercent,
      input.includeVat ? 1 : 0,
      netAmount,
      discountAmount,
      subtotal,
      vatAmount,
      total,
      JSON.stringify(input.products),
      session.username,
      session.companyId,
    ],
  );

  return getQuote(session.companyId, result.rows[0].id);
}

export async function acceptQuote(companyId: number, id: number) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    "UPDATE presupuestos SET estado = 'aceptada' WHERE id = $1 AND empresa_id = $2 RETURNING id",
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Presupuesto no encontrado");
  return { id, redirect: `/orders/new?quoteId=${id}` };
}

export async function deleteQuote(companyId: number, id: number) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    "DELETE FROM presupuestos WHERE id = $1 AND empresa_id = $2 RETURNING id",
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Presupuesto no encontrado");
  return { id };
}
