import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { intField, numberField, textField, type RequestBody } from "@/lib/request-body";
import type { AuthSession } from "@/lib/auth";

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
  taxIdType: string;
  taxId: string;
  vatCondition: string;
  phone: string;
  status: string;
  address: string;
  priceList: string;
  province: string;
  city: string;
  observation: string;
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
  status: string;
  seller: string;
  observation: string;
};

export type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
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
};

export type ProductUpdateInput = {
  name: string;
  cost: number;
  description: string;
  stock: number;
  code: string;
  justification: string;
};

const DEFAULT_COMPANY_ID = 1;

function searchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function normalizeTaxId(value: string) {
  return value.replaceAll(/\D/g, "");
}

function firstText(body: RequestBody, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = textField(body, key, "");
    if (value !== "") return value;
  }
  return fallback;
}

function firstNumber(body: RequestBody, keys: string[], fallback = 0) {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return numberField(body, key, fallback);
    }
  }
  return fallback;
}

function firstInt(body: RequestBody, keys: string[], fallback = 0) {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return intField(body, key, fallback);
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
  tax_id: string | null;
  fiscal_condition: string | null;
  phone: string | null;
  active: boolean;
  address: string | null;
  price_list_name: string | null;
  province: string | null;
  locality: string | null;
  notes: string | null;
}): CustomerDetail {
  return {
    id: row.id,
    code: row.external_code ?? "",
    name: row.display_name,
    businessName: row.legal_name ?? "",
    seller: row.seller_name ?? "",
    taxIdType: row.tax_id ? "CUIT" : "",
    taxId: row.tax_id ?? "",
    vatCondition: row.fiscal_condition ?? "",
    phone: row.phone ?? "",
    status: row.active ? "activo" : "inactivo",
    address: row.address ?? "",
    priceList: row.price_list_name ?? "",
    province: row.province ?? "",
    city: row.locality ?? "",
    observation: row.notes ?? "",
  };
}

function mapSupplier(row: {
  id: string;
  display_name: string;
  legal_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}): Supplier {
  return {
    id: row.id,
    name: row.display_name,
    contact: row.legal_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
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
  };
}

export function customerInputFromBody(
  body: RequestBody,
  defaults: Partial<CustomerInput> = {},
): CustomerInput {
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
    status: firstText(body, ["status", "estado"], defaults.status ?? "activo"),
    seller: firstText(body, ["seller", "vendedor_cl"], defaults.seller),
    observation: firstText(body, ["observation", "observacion"], defaults.observation),
  };

  if (!input.name) throw new ApiError(400, "El nombre es obligatorio");
  return input;
}

export function supplierInputFromBody(
  body: RequestBody,
  defaults: Partial<SupplierInput> = {},
): SupplierInput {
  const input = {
    name: firstText(body, ["name", "nombre"], defaults.name),
    contact: firstText(body, ["contact", "contacto"], defaults.contact),
    phone: firstText(body, ["phone", "telefono"], defaults.phone),
    email: firstText(body, ["email"], defaults.email),
    address: firstText(body, ["address", "direccion"], defaults.address),
    notes: firstText(body, ["notes", "notas"], defaults.notes),
  };

  if (!input.name) throw new ApiError(400, "El nombre es obligatorio");
  return input;
}

export function productUpdateInputFromBody(
  body: RequestBody,
  defaults: ProductDetail,
): ProductUpdateInput {
  const input = {
    name: firstText(body, ["name", "nombre"], defaults.name),
    cost: firstNumber(body, ["cost", "precio", "costo"], defaults.cost),
    description: firstText(body, ["description", "descripcion"], defaults.description),
    stock: firstInt(body, ["stock", "cantidad"], defaults.stock),
    code: firstText(body, ["code", "codigo"], defaults.code).toUpperCase(),
    justification: firstText(body, ["justification", "justificacion"]),
  };

  if (!input.name) throw new ApiError(400, "El nombre es obligatorio");
  if (input.cost < 0) throw new ApiError(400, "El costo no puede ser negativo");
  if (input.stock < 0) throw new ApiError(400, "El stock no puede ser negativo");
  if (!input.justification) {
    throw new ApiError(400, "Debe ingresar una justificacion para el cambio");
  }

  return input;
}

export async function getCustomer(companyId: number, id: string) {
  const result = await queryWithCompanyContext<Parameters<typeof mapCustomer>[0]>(
    companyId,
    `
      SELECT id, external_code, display_name, legal_name, seller_name, tax_id,
             fiscal_condition, phone, active, address, price_list_name,
             province, locality, notes
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
        notes, empresa_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10 <> 'inactivo', $11, $12, $13)
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
      input.priceList,
      input.status,
      input.seller,
      input.observation,
      companyId,
    ],
  );

  return getCustomer(companyId, result.rows[0].id);
}

export async function updateCustomer(companyId: number, id: string, input: CustomerInput) {
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
          notes = $12,
          updated_at = now()
      WHERE id = $13::uuid AND empresa_id = $14
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
      input.priceList,
      input.status,
      input.seller,
      input.observation,
      id,
      companyId,
    ],
  );

  if (!result.rows[0]) throw new ApiError(404, "Cliente no encontrado");
  return getCustomer(companyId, id);
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
      `(display_name ILIKE $${params.length} ESCAPE '\\' OR legal_name ILIKE $${params.length} ESCAPE '\\' OR phone ILIKE $${params.length} ESCAPE '\\' OR email ILIKE $${params.length} ESCAPE '\\' OR address ILIKE $${params.length} ESCAPE '\\' OR notes ILIKE $${params.length} ESCAPE '\\')`,
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
      SELECT id, display_name, legal_name, phone, email, address, notes, created_at::text
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
      SELECT id, display_name, legal_name, phone, email, address, notes, created_at::text
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
      INSERT INTO suppliers (display_name, legal_name, phone, email, address, notes, empresa_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id::text AS id
    `,
    [input.name, input.contact, input.phone, input.email, input.address, input.notes, companyId],
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
          phone = $3,
          email = $4,
          address = $5,
          notes = $6,
          updated_at = now()
      WHERE id = $7::uuid AND empresa_id = $8 AND active = true
      RETURNING id::text AS id
    `,
    [input.name, input.contact, input.phone, input.email, input.address, input.notes, id, companyId],
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
             p.name, p.cost::text, '' AS description,
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
               p.name, p.cost::text, '' AS description,
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

    const updateResult = await client.query<{ id: string }>(
      `
        UPDATE products
        SET name = $1,
            cost = $2,
            category_code = $3,
            updated_at = now()
        WHERE id = $4::uuid AND empresa_id = $5 AND active = true
        RETURNING id::text AS id
      `,
      [input.name, input.cost, input.code, id, session.companyId],
    );
    if (!updateResult.rows[0]) throw new ApiError(404, "Producto no encontrado");

    const currentStock = Number(current.stock);
    const stockDelta = input.stock - currentStock;
    if (stockDelta !== 0) {
      await client.query(
        `
          INSERT INTO stock_movements (
            product_id, movement_type, quantity, notes, empresa_id
          )
          VALUES ($1::uuid, $2::stock_movement_type, $3, $4, $5)
        `,
        [
          id,
          stockDelta > 0 ? "ajuste_positivo" : "ajuste_negativo",
          Math.abs(stockDelta),
          `Ajuste manual por ${session.username}: ${input.justification}`,
          session.companyId,
        ],
      );
    }

    const changes = [
      { key: "name", label: "Nombre", before: current.name, after: input.name },
      {
        key: "costo",
        label: "Costo",
        before: Number(current.cost ?? 0).toFixed(2),
        after: Number(input.cost).toFixed(2),
      },
      {
        key: "descripcion",
        label: "Descripcion",
        before: current.description ?? "",
        after: input.description,
      },
      {
        key: "stock",
        label: "Stock",
        before: String(currentStock),
        after: String(input.stock),
      },
      { key: "codigo", label: "Categoria", before: current.category_code ?? "", after: input.code },
    ]
      .filter((change) => change.before !== change.after)
      .map(({ label, before, after }) => ({ label, antes: before, despues: after }));

    return {
      data: mapProduct({
        ...current,
        name: input.name,
        cost: String(input.cost),
        description: input.description,
        stock: String(input.stock),
        category_code: input.code,
      }),
      changedFields: changes.length,
    };
  });

  clearReadQueryCache();
  return result;
}
