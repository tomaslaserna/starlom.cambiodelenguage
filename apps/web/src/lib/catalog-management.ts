import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { resolvePriceListName } from "@/lib/order-pricing";
import { parsePagination } from "@/lib/pagination";
import { saleOrderDocument, type SaleOrderDocument } from "@/lib/receipt-types";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import type { AuthSession } from "@/lib/auth";
import type { PoolClient } from "pg";
import { CUSTOMER_RECEIPT_OPTIONS, type CustomerReceiptType } from "@/lib/customer-receipt-types";
export { CUSTOMER_RECEIPT_OPTIONS } from "@/lib/customer-receipt-types";
export type { CustomerReceiptType } from "@/lib/customer-receipt-types";

type ListInput = {
  companyId?: number;
  query?: string | null;
  page?: string | null;
  pageSize?: string | null;
};

type ListResult<T> = {
  data: T[];
  meta: {
    companyId: number;
    query: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type CustomerDetail = {
  id: string;
  code: string;
  name: string;
  businessName: string;
  seller: string;
  assignedSeller: string;
  taxIdType: string;
  taxId: string;
  vatCondition: string;
  phone: string;
  status: string;
  address: string;
  priceList: string;
  receiptType: string;
  province: string;
  city: string;
  observation: string;
  businessSegment: string;
  suggestedBusinessSegment: string;
  businessSegmentConfidence: number | null;
};

export type CustomerInput = {
  name: string;
  businessName: string;
  taxIdType: string;
  taxId: string;
  vatCondition: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  priceList: string;
  receiptType: string;
  status: string;
  seller: string;
  assignedSeller: string;
  observation: string;
  businessSegment: string;
};

export type Supplier = {
  id: string;
  name: string;
  contact: string;
  rubric: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  paymentTermDays: number;
  createdAt: string;
};

export type SupplierInput = Omit<Supplier, "id" | "createdAt">;

export type ProductDetail = {
  id: string;
  productId: string;
  category: string;
  code: string;
  supplier: string;
  name: string;
  cost: number;
  stock: number;
  description: string;
  presentationUnits: number;
};

export type ProductUpdateInput = {
  name: string;
  cost: number;
  code: string;
  category: string;
  presentationUnits: number;
  justification: string;
};

const DEFAULT_COMPANY_ID = 1;
const VALID_CUSTOMER_BUSINESS_SEGMENTS = new Set([
  "Restaurante", "Cafetería", "Bar", "Salón de eventos", "Cancha o club deportivo", "Consorcio",
  "Fábrica o industria", "Salud o rehabilitación", "Hotelería", "Comercio", "Empresa de limpieza", "Institución", "Otro",
]);

async function nextCategorySku(client: PoolClient, companyId: number, categoryCode: string) {
  const prefix = categoryCode.trim().toUpperCase();
  await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [companyId, `product-sku:${prefix}`]);
  const result = await client.query<{ next_number: string }>(
    "SELECT (COALESCE(MAX(substring(sku from '[0-9]+$')::bigint), 0) + 1)::text AS next_number FROM products WHERE empresa_id = $1 AND sku ~ ('^' || $2 || '-[0-9]+$')",
    [companyId, prefix],
  );
  return `${prefix}-${String(result.rows[0]?.next_number ?? "1").padStart(5, "0")}`;
}

const CUSTOMER_RECEIPT_TYPE_LABELS: Record<SaleOrderDocument, CustomerReceiptType> = {
  remito: "Remito",
  factura_a: "Factura A",
  factura_b: "Factura B",
};

async function resolveCustomerPriceList(companyId: number, value: string) {
  const result = await queryWithCompanyContext<{ nombre: string }>(
    companyId,
    `
      SELECT nombre
      FROM listas_precio
      WHERE empresa_id = $1 AND activa = 1 AND (blocked_until IS NULL OR blocked_until < CURRENT_DATE)
      ORDER BY orden ASC, nombre ASC
    `,
    [companyId],
  );
  return resolvePriceListName(value, result.rows.map((row) => row.nombre));
}

function searchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function normalizeTaxId(value: string) {
  return value.replaceAll(/\D/g, "");
}

export function normalizeCustomerReceiptType(value: string): CustomerReceiptType {
  const document = saleOrderDocument(value);
  if (!document) {
    throw new ApiError(400, "El comprobante asociado debe ser Remito, Factura A o Factura B");
  }
  return CUSTOMER_RECEIPT_TYPE_LABELS[document];
}

export function customerReceiptTypeOptionValue(value: string): CustomerReceiptType | "" {
  try {
    return normalizeCustomerReceiptType(value);
  } catch {
    return "";
  }
}

function firstText(body: RequestBody, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = textField(body, key, "");
    if (value !== "") return value;
  }
  return fallback;
}

function providedText(body: RequestBody, keys: string[]) {
  const key = keys.find((candidate) => body[candidate] !== undefined && body[candidate] !== null);
  return key ? textField(body, key, "") : null;
}

function firstNumber(body: RequestBody, keys: string[], fallback = 0) {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return numberField(body, key, fallback);
    }
  }
  return fallback;
}

function mapCustomer(row: {
  id: string;
  external_code: string | null;
  display_name: string;
  legal_name: string | null;
  seller_name: string | null;
  assigned_seller: string | null;
  tax_id: string | null;
  fiscal_condition: string | null;
  phone: string | null;
  active: boolean;
  address: string | null;
  price_list_name: string | null;
  receipt_type: string | null;
  province: string | null;
  locality: string | null;
  notes: string | null;
  payment_term_days: number | null;
  business_segment: string | null;
  business_segment_suggested: string | null;
  business_segment_confidence: string | null;
}): CustomerDetail {
  return {
    id: row.id,
    code: row.external_code ?? "",
    name: row.display_name,
    businessName: row.legal_name ?? "",
    seller: row.seller_name ?? "",
    assignedSeller: row.assigned_seller ?? "",
    taxIdType: row.tax_id ? "CUIT" : "",
    taxId: row.tax_id ?? "",
    vatCondition: row.fiscal_condition ?? "",
    phone: row.phone ?? "",
    status: row.active ? "activo" : "inactivo",
    address: row.address ?? "",
    priceList: row.price_list_name ?? "",
    receiptType: row.receipt_type ?? "",
    province: row.province ?? "",
    city: row.locality ?? "",
    observation: row.notes ?? "",
    businessSegment: row.business_segment ?? "",
    suggestedBusinessSegment: row.business_segment_suggested ?? "",
    businessSegmentConfidence: row.business_segment_confidence === null ? null : Number(row.business_segment_confidence),
  };
}

function mapSupplier(row: {
  id: string;
  display_name: string;
  legal_name: string | null;
  rubric: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  payment_term_days: number | null;
  created_at: string;
}): Supplier {
  const legacy = splitSupplierNotes(row.notes ?? "");
  return {
    id: row.id,
    name: row.display_name,
    contact: row.legal_name ?? "",
    rubric: row.rubric || legacy.rubric,
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    notes: row.rubric ? row.notes ?? "" : legacy.notes,
    paymentTermDays: Number(row.payment_term_days ?? 0),
    createdAt: row.created_at,
  };
}

function splitSupplierNotes(rawNotes: string) {
  const match = rawNotes.match(/^\[Rubro:\s*([^\]]+)\]\s*/i);
  if (!match) return { rubric: "", notes: rawNotes };
  return {
    rubric: match[1]?.trim() ?? "",
    notes: rawNotes.slice(match[0].length).trimStart(),
  };
}

function mapProduct(row: {
  id: string;
  sku: string | null;
  category: string | null;
  category_code: string | null;
  supplier_name: string | null;
  name: string;
  cost: string | null;
  stock: string;
  description: string | null;
  presentation_units: number;
}): ProductDetail {
  return {
    id: row.id,
    productId: row.id,
    category: row.category ?? "",
    code: row.category_code ?? row.sku ?? "",
    supplier: row.supplier_name ?? "",
    name: row.name,
    cost: Number(row.cost ?? 0),
    stock: Number(row.stock),
    description: row.description ?? "",
    presentationUnits: Number(row.presentation_units ?? 1),
  };
}

export function customerInputFromBody(
  body: RequestBody,
  defaults: Partial<CustomerInput> = {},
): CustomerInput {
  const providedReceiptType = providedText(body, [
    "receiptType",
    "receipt_type",
    "tipo_comprobante",
    "comprobante",
  ]);
  const receiptType =
    providedReceiptType !== null
      ? normalizeCustomerReceiptType(providedReceiptType)
      : defaults.receiptType !== undefined
        ? defaults.receiptType
        : normalizeCustomerReceiptType("");
  const input = {
    name: firstText(body, ["name", "nombre_cliente"], defaults.name),
    businessName: firstText(body, ["businessName", "razon_social"], defaults.businessName),
    taxIdType: firstText(body, ["taxIdType", "tipo_id"], defaults.taxIdType),
    taxId: firstText(body, ["taxId", "nro_id"], defaults.taxId),
    vatCondition: firstText(body, ["vatCondition", "cond_iva"], defaults.vatCondition),
    phone: firstText(body, ["phone", "telefono"], defaults.phone),
    address: firstText(body, ["address", "domicilio"], defaults.address),
    city: firstText(body, ["city", "ciudad"], defaults.city),
    province: firstText(body, ["province", "provincia"], defaults.province),
    priceList: firstText(body, ["priceList", "lista_precios"], defaults.priceList),
    receiptType,
    status: firstText(body, ["status", "estado"], defaults.status ?? "activo"),
    seller: firstText(body, ["seller", "vendedor_cl"], defaults.seller),
    assignedSeller: firstText(body, ["assignedSeller", "vendedor_asignado"], defaults.assignedSeller),
    observation: firstText(body, ["observation", "observacion"], defaults.observation),
    businessSegment: firstText(body, ["businessSegment", "business_segment", "rubro"], defaults.businessSegment),
  };

  if (!input.name) throw new ApiError(400, "El nombre es obligatorio");
  if (input.businessSegment && !VALID_CUSTOMER_BUSINESS_SEGMENTS.has(input.businessSegment)) {
    throw new ApiError(400, "El rubro seleccionado no es válido");
  }
  return input;
}

export function supplierInputFromBody(
  body: RequestBody,
  defaults: Partial<SupplierInput> = {},
): SupplierInput {
  const input = {
    name: firstText(body, ["name", "nombre"], defaults.name),
    contact: firstText(body, ["contact", "contacto"], defaults.contact),
    rubric: firstText(body, ["rubric", "rubro"], defaults.rubric),
    phone: firstText(body, ["phone", "telefono"], defaults.phone),
    email: firstText(body, ["email"], defaults.email),
    address: firstText(body, ["address", "direccion"], defaults.address),
    notes: firstText(body, ["notes", "notas"], defaults.notes),
    paymentTermDays: Math.max(0, Math.trunc(firstNumber(body, ["paymentTermDays", "plazo_pago_dias"], defaults.paymentTermDays))),
  };

  if (!input.name) throw new ApiError(400, "El nombre es obligatorio");
  return input;
}

export function productUpdateInputFromBody(
  body: RequestBody,
  defaults: ProductDetail,
): ProductUpdateInput {
  if (body.stock !== undefined || body.cantidad !== undefined) {
    throw new ApiError(400, "El stock se modifica desde Entradas y salidas, no desde el catalogo");
  }
  const input = {
    name: firstText(body, ["name", "nombre"], defaults.name),
    cost: firstNumber(body, ["cost", "precio", "costo"], defaults.cost),
    code: firstText(body, ["code", "codigo"], defaults.code).toUpperCase(),
    category: firstText(body, ["category", "categoria"], defaults.category),
    presentationUnits: Math.trunc(firstNumber(body, ["presentationUnits", "presentacion"], defaults.presentationUnits)),
    justification: firstText(body, ["justification", "justificacion"]),
  };

  if (!input.name) throw new ApiError(400, "El nombre es obligatorio");
  if (input.cost < 0) throw new ApiError(400, "El costo no puede ser negativo");
  if (input.presentationUnits < 1 || input.presentationUnits > 9999) {
    throw new ApiError(400, "La presentacion debe tener entre 1 y 9999 unidades");
  }
  if (!input.justification) {
    throw new ApiError(400, "Debe ingresar una justificacion para el cambio");
  }

  return input;
}

export async function getCustomer(companyId: number, id: string) {
  const result = await queryWithCompanyContext<Parameters<typeof mapCustomer>[0]>(
    companyId,
    `
      SELECT id, external_code, display_name, legal_name, seller_name, assigned_seller, tax_id,
             fiscal_condition, phone, active, address, price_list_name, receipt_type,
             province, locality, notes, business_segment, business_segment_suggested,
             business_segment_confidence::text
      FROM clients
      WHERE id = $1::uuid AND empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );

  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Cliente no encontrado");
  return mapCustomer(row);
}

export async function createCustomer(companyId: number, input: CustomerInput) {
  const normalizedTaxId = normalizeTaxId(input.taxId);
  const priceList = await resolveCustomerPriceList(companyId, input.priceList);

  if (normalizedTaxId) {
    const duplicate = await queryWithCompanyContext<{ id: string }>(
      companyId,
      `
        SELECT id::text AS id
        FROM clients
        WHERE empresa_id = $1
          AND regexp_replace(COALESCE(tax_id, ''), '[^0-9]', '', 'g') = $2
        LIMIT 1
      `,
      [companyId, normalizedTaxId],
    );

    if (duplicate.rows[0]) throw new ApiError(409, "Ya existe un cliente con ese CUIT/DNI");
  }

  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      INSERT INTO clients (
        display_name, legal_name, tax_id, fiscal_condition, phone,
        address, locality, province, price_list_name, active, seller_name,
        receipt_type, notes, empresa_id, assigned_seller, business_segment,
        business_segment_reviewed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10 <> 'inactivo', $11, $12, $13, $14, $15,
              NULLIF($16, ''), CASE WHEN NULLIF($16, '') IS NULL THEN NULL ELSE now() END)
      RETURNING id::text AS id
    `,
    [
      input.name,
      input.businessName,
      input.taxId,
      input.vatCondition,
      input.phone,
      input.address,
      input.city,
      input.province,
      priceList,
      input.status,
      input.seller,
      normalizeCustomerReceiptType(input.receiptType),
      input.observation,
      companyId,
      input.assignedSeller,
      input.businessSegment,
    ],
  );

  clearReadQueryCache();
  return getCustomer(companyId, result.rows[0].id);
}

export async function updateCustomer(companyId: number, id: string, input: CustomerInput) {
  const priceList = await resolveCustomerPriceList(companyId, input.priceList);
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      UPDATE clients
      SET display_name = $1,
          legal_name = $2,
          tax_id = $3,
          fiscal_condition = $4,
          phone = $5,
          address = $6,
          locality = $7,
          province = $8,
          price_list_name = $9,
          active = $10 <> 'inactivo',
          seller_name = $11,
          receipt_type = COALESCE(NULLIF($12, ''), receipt_type),
          notes = $13,
          assigned_seller = $16,
          business_segment = NULLIF($17, ''),
          business_segment_reviewed_at = CASE WHEN business_segment IS DISTINCT FROM NULLIF($17, '') THEN now() ELSE business_segment_reviewed_at END,
          updated_at = now()
      WHERE id = $14::uuid AND empresa_id = $15
      RETURNING id::text AS id
    `,
    [
      input.name,
      input.businessName,
      input.taxId,
      input.vatCondition,
      input.phone,
      input.address,
      input.city,
      input.province,
      priceList,
      input.status,
      input.seller,
      input.receiptType,
      input.observation,
      id,
      companyId,
      input.assignedSeller,
      input.businessSegment,
    ],
  );

  if (!result.rows[0]) throw new ApiError(404, "Cliente no encontrado");
  clearReadQueryCache();
  return getCustomer(companyId, id);
}

export async function updateCustomerReceiptType(companyId: number, id: string, value: string) {
  const receiptType = normalizeCustomerReceiptType(value);
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      UPDATE clients
      SET receipt_type = $1,
          updated_at = now()
      WHERE id = $2::uuid AND empresa_id = $3
      RETURNING id::text AS id
    `,
    [receiptType, id, companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Cliente no encontrado");
  clearReadQueryCache();
  return { id, receiptType };
}

export async function updateCustomerBusinessSegment(companyId: number, id: string, value: string) {
  const businessSegment = value.trim();
  if (businessSegment && !VALID_CUSTOMER_BUSINESS_SEGMENTS.has(businessSegment)) {
    throw new ApiError(400, "Rubro comercial invalido");
  }
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      UPDATE clients
      SET business_segment = NULLIF($1, ''),
          business_segment_reviewed_at = CASE WHEN NULLIF($1, '') IS NULL THEN NULL ELSE now() END,
          updated_at = now()
      WHERE id = $2::uuid AND empresa_id = $3
      RETURNING id::text AS id
    `,
    [businessSegment, id, companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Cliente no encontrado");
  clearReadQueryCache();
  return { id, businessSegment };
}

export async function listSuppliers(input: ListInput = {}): Promise<ListResult<Supplier>> {
  const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
  const query = input.query?.trim() ?? "";
  const pagination = parsePagination(input);
  const params: unknown[] = [companyId];
  const filters = ["empresa_id = $1", "active = true"];

  if (query) {
    params.push(searchPattern(query));
    filters.push(
      `(display_name ILIKE $${params.length} ESCAPE '\\' OR legal_name ILIKE $${params.length} ESCAPE '\\' OR rubric ILIKE $${params.length} ESCAPE '\\' OR phone ILIKE $${params.length} ESCAPE '\\' OR email ILIKE $${params.length} ESCAPE '\\' OR address ILIKE $${params.length} ESCAPE '\\' OR notes ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM suppliers WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<Parameters<typeof mapSupplier>[0]>(
    companyId,
    `
      SELECT id, display_name, legal_name, rubric, phone, email, address, notes, payment_term_days, created_at::text
      FROM suppliers
      WHERE ${where}
      ORDER BY display_name ASC, id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

  return {
    data: rows.rows.map(mapSupplier),
    meta: {
      companyId,
      query,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}

export async function getSupplier(companyId: number, id: string) {
  const result = await queryWithCompanyContext<Parameters<typeof mapSupplier>[0]>(
    companyId,
    `
      SELECT id, display_name, legal_name, rubric, phone, email, address, notes, payment_term_days, created_at::text
      FROM suppliers
      WHERE id = $1::uuid AND empresa_id = $2 AND active = true
      LIMIT 1
    `,
    [id, companyId],
  );

  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Proveedor no encontrado");
  return mapSupplier(row);
}

export async function createSupplier(companyId: number, input: SupplierInput) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      INSERT INTO suppliers (display_name, legal_name, rubric, phone, email, address, notes, payment_term_days, empresa_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id::text AS id
    `,
    [
      input.name,
      input.contact,
      input.rubric,
      input.phone,
      input.email,
      input.address,
      input.notes,
      input.paymentTermDays,
      companyId,
    ],
  );

  return getSupplier(companyId, result.rows[0].id);
}

export async function updateSupplier(companyId: number, id: string, input: SupplierInput) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      UPDATE suppliers
      SET display_name = $1,
          legal_name = $2,
          rubric = $3,
          phone = $4,
          email = $5,
          address = $6,
          notes = $7,
          payment_term_days = $8,
          updated_at = now()
      WHERE id = $9::uuid AND empresa_id = $10 AND active = true
      RETURNING id::text AS id
    `,
    [
      input.name,
      input.contact,
      input.rubric,
      input.phone,
      input.email,
      input.address,
      input.notes,
      input.paymentTermDays,
      id,
      companyId,
    ],
  );

  if (!result.rows[0]) throw new ApiError(404, "Proveedor no encontrado");
  return getSupplier(companyId, id);
}

export async function deleteSupplier(companyId: number, id: string) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      UPDATE suppliers
      SET active = false,
          updated_at = now()
      WHERE id = $1::uuid AND empresa_id = $2 AND active = true
      RETURNING id::text AS id
    `,
    [id, companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Proveedor no encontrado");
  return { id };
}

export async function getProduct(companyId: number, id: string) {
  const result = await queryWithCompanyContext<Parameters<typeof mapProduct>[0]>(
    companyId,
    `
      SELECT p.id::text AS id, p.sku, p.category, p.category_code,
             COALESCE(s.display_name, '') AS supplier_name,
             p.name, p.cost::text, p.presentation_units, '' AS description,
             COALESCE(stock.current_stock, 0)::text AS stock
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      LEFT JOIN LATERAL (
        SELECT SUM(
          CASE
            WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
            ELSE -sm.quantity
          END
        ) AS current_stock
        FROM stock_movements sm
        WHERE sm.product_id = p.id AND sm.empresa_id = p.empresa_id
      ) stock ON true
      WHERE p.id = $1::uuid AND p.empresa_id = $2 AND p.active = true
      LIMIT 1
    `,
    [id, companyId],
  );

  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Producto no encontrado");
  return mapProduct(row);
}

export async function updateProduct(
  session: AuthSession,
  id: string,
  input: ProductUpdateInput,
) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const currentResult = await client.query<Parameters<typeof mapProduct>[0]>(
      `
        SELECT p.id::text AS id, p.sku, p.category, p.category_code,
               COALESCE(s.display_name, '') AS supplier_name,
               p.name, p.cost::text, p.presentation_units, '' AS description,
               COALESCE(stock.current_stock, 0)::text AS stock
        FROM products p
        LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
        LEFT JOIN LATERAL (
          SELECT SUM(
            CASE
              WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
              ELSE -sm.quantity
            END
          ) AS current_stock
          FROM stock_movements sm
          WHERE sm.product_id = p.id AND sm.empresa_id = p.empresa_id
        ) stock ON true
        WHERE p.id = $1::uuid AND p.empresa_id = $2 AND p.active = true
        LIMIT 1
      `,
      [id, session.companyId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, "Producto no encontrado");

    const marginResult = await client.query<{ nombre: string }>(
      "SELECT nombre FROM margenes WHERE codigo = $1 AND empresa_id = $2 LIMIT 1",
      [input.code, session.companyId],
    );
    const categoryName = marginResult.rows[0]?.nombre;
    if (!categoryName) throw new ApiError(400, "La categoría seleccionada no existe");

    const categoryChanged = (current.category_code ?? "").toUpperCase() !== input.code;
    const nextSku = categoryChanged
      ? await nextCategorySku(client, session.companyId, input.code)
      : current.sku;

    const updateResult = await client.query<{ id: string }>(
      `
        UPDATE products
        SET name = $1,
            cost = $2,
            category_code = $3,
            category = $6,
            presentation_units = $7,
            legacy_sku = CASE WHEN $8::boolean THEN COALESCE(legacy_sku, sku) ELSE legacy_sku END,
            sku = $9,
            updated_at = now()
        WHERE id = $4::uuid AND empresa_id = $5 AND active = true
        RETURNING id::text AS id
      `,
      [input.name, input.cost, input.code, id, session.companyId, categoryName, input.presentationUnits, categoryChanged, nextSku],
    );
    if (!updateResult.rows[0]) throw new ApiError(404, "Producto no encontrado");

    const changes = [
      { key: "name", label: "Nombre", before: current.name, after: input.name },
      {
        key: "costo",
        label: "Costo",
        before: Number(current.cost ?? 0).toFixed(2),
        after: Number(input.cost).toFixed(2),
      },
      { key: "codigo", label: "Categoria", before: current.category_code ?? "", after: input.code },
      { key: "categoria", label: "Categoría del artículo", before: current.category ?? "", after: categoryName },
      { key: "presentacion", label: "Presentación", before: String(current.presentation_units ?? 1), after: String(input.presentationUnits) },
    ]
      .filter((change) => change.before !== change.after)
      .map(({ label, before, after }) => ({ label, antes: before, despues: after }));

    return {
      data: mapProduct({
        ...current,
        name: input.name,
        cost: String(input.cost),
        category_code: input.code,
        category: categoryName,
        presentation_units: input.presentationUnits,
      }),
      changedFields: changes.length,
    };
  });

  clearReadQueryCache();
  return result;
}
