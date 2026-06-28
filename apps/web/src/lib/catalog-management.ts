import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
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
  id: number;
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
  id: number;
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
  id: number;
  productId: number;
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
  id: number;
  codigo_cliente: string;
  nombre_cliente: string;
  razon_social: string;
  vendedor_cl: string;
  tipo_id: string;
  nro_id: string;
  cond_iva: string;
  telefono: string;
  estado: string;
  domicilio: string;
  lista_precios: string;
  provincia: string;
  ciudad: string;
  observacion: string;
}): CustomerDetail {
  return {
    id: row.id,
    code: row.codigo_cliente,
    name: row.nombre_cliente,
    businessName: row.razon_social,
    seller: row.vendedor_cl,
    taxIdType: row.tipo_id,
    taxId: row.nro_id,
    vatCondition: row.cond_iva,
    phone: row.telefono,
    status: row.estado,
    address: row.domicilio,
    priceList: row.lista_precios,
    province: row.provincia,
    city: row.ciudad,
    observation: row.observacion,
  };
}

function mapSupplier(row: {
  id: number;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
  created_at: string;
}): Supplier {
  return {
    id: row.id,
    name: row.nombre,
    contact: row.contacto,
    phone: row.telefono,
    email: row.email,
    address: row.direccion,
    notes: row.notas,
    createdAt: row.created_at,
  };
}

function mapProduct(row: {
  id: number;
  id_producto: number;
  categoria: string;
  codigo: string;
  proveedor: string;
  nombre: string;
  costo: string;
  stock: number;
  descripcion: string;
}): ProductDetail {
  return {
    id: row.id,
    productId: row.id_producto,
    category: row.categoria,
    code: row.codigo,
    supplier: row.proveedor,
    name: row.nombre,
    cost: Number(row.costo),
    stock: row.stock,
    description: row.descripcion,
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

export async function getCustomer(companyId: number, id: number) {
  const result = await queryWithCompanyContext<Parameters<typeof mapCustomer>[0]>(
    companyId,
    `
      SELECT id, codigo_cliente, nombre_cliente, razon_social, vendedor_cl, tipo_id,
             nro_id, cond_iva, telefono, estado, domicilio, lista_precios,
             provincia, ciudad, observacion
      FROM clientes
      WHERE id = $1 AND empresa_id = $2
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
    const duplicate = await queryWithCompanyContext<{ id: number }>(
      companyId,
      `
        SELECT id
        FROM clientes
        WHERE empresa_id = $1
          AND regexp_replace(nro_id, '[^0-9]', '', 'g') = $2
        LIMIT 1
      `,
      [companyId, normalizedTaxId],
    );

    if (duplicate.rows[0]) throw new ApiError(409, "Ya existe un cliente con ese CUIT/DNI");
  }

  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      INSERT INTO clientes (
        nombre_cliente, razon_social, tipo_id, nro_id, cond_iva, telefono,
        domicilio, ciudad, provincia, lista_precios, estado, vendedor_cl,
        observacion, empresa_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `,
    [
      input.name,
      input.businessName,
      input.taxIdType,
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

export async function updateCustomer(companyId: number, id: number, input: CustomerInput) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      UPDATE clientes
      SET nombre_cliente = $1,
          razon_social = $2,
          tipo_id = $3,
          nro_id = $4,
          cond_iva = $5,
          telefono = $6,
          domicilio = $7,
          ciudad = $8,
          provincia = $9,
          lista_precios = $10,
          estado = $11,
          vendedor_cl = $12,
          observacion = $13
      WHERE id = $14 AND empresa_id = $15
      RETURNING id
    `,
    [
      input.name,
      input.businessName,
      input.taxIdType,
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
  const filters = ["empresa_id = $1"];

  if (query) {
    params.push(searchPattern(query));
    filters.push(
      `(nombre ILIKE $${params.length} ESCAPE '\\' OR contacto ILIKE $${params.length} ESCAPE '\\' OR telefono ILIKE $${params.length} ESCAPE '\\' OR email ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM proveedores WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<Parameters<typeof mapSupplier>[0]>(
    companyId,
    `
      SELECT id, nombre, contacto, telefono, email, direccion, notas, created_at::text
      FROM proveedores
      WHERE ${where}
      ORDER BY nombre ASC, id ASC
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

export async function getSupplier(companyId: number, id: number) {
  const result = await queryWithCompanyContext<Parameters<typeof mapSupplier>[0]>(
    companyId,
    `
      SELECT id, nombre, contacto, telefono, email, direccion, notas, created_at::text
      FROM proveedores
      WHERE id = $1 AND empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );

  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Proveedor no encontrado");
  return mapSupplier(row);
}

export async function createSupplier(companyId: number, input: SupplierInput) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      INSERT INTO proveedores (nombre, contacto, telefono, email, direccion, notas, empresa_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [input.name, input.contact, input.phone, input.email, input.address, input.notes, companyId],
  );

  return getSupplier(companyId, result.rows[0].id);
}

export async function updateSupplier(companyId: number, id: number, input: SupplierInput) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      UPDATE proveedores
      SET nombre = $1,
          contacto = $2,
          telefono = $3,
          email = $4,
          direccion = $5,
          notas = $6
      WHERE id = $7 AND empresa_id = $8
      RETURNING id
    `,
    [input.name, input.contact, input.phone, input.email, input.address, input.notes, id, companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Proveedor no encontrado");
  return getSupplier(companyId, id);
}

export async function deleteSupplier(companyId: number, id: number) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    "DELETE FROM proveedores WHERE id = $1 AND empresa_id = $2 RETURNING id",
    [id, companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Proveedor no encontrado");
  return { id };
}

export async function getProduct(companyId: number, id: number) {
  const result = await queryWithCompanyContext<Parameters<typeof mapProduct>[0]>(
    companyId,
    `
      SELECT id, id_producto, categoria, codigo, proveedor, nombre, costo::text,
             stock, descripcion
      FROM productos
      WHERE id = $1 AND empresa_id = $2
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
  id: number,
  input: ProductUpdateInput,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const currentResult = await client.query<Parameters<typeof mapProduct>[0]>(
      `
        SELECT id, id_producto, categoria, codigo, proveedor, nombre, costo::text,
               stock, descripcion
        FROM productos
        WHERE id = $1 AND empresa_id = $2
        LIMIT 1
      `,
      [id, session.companyId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, "Producto no encontrado");

    const updateResult = await client.query<{ id: number }>(
      `
        UPDATE productos
        SET nombre = $1,
            costo = $2,
            descripcion = $3,
            stock = $4,
            codigo = $5
        WHERE id = $6 AND empresa_id = $7
        RETURNING id
      `,
      [
        input.name,
        input.cost,
        input.description,
        input.stock,
        input.code,
        id,
        session.companyId,
      ],
    );
    if (!updateResult.rows[0]) throw new ApiError(404, "Producto no encontrado");

    const changes = [
      { key: "nombre", label: "Nombre", before: current.nombre, after: input.name },
      {
        key: "costo",
        label: "Costo",
        before: Number(current.costo).toFixed(2),
        after: Number(input.cost).toFixed(2),
      },
      {
        key: "descripcion",
        label: "Descripcion",
        before: current.descripcion,
        after: input.description,
      },
      {
        key: "stock",
        label: "Stock",
        before: String(current.stock),
        after: String(input.stock),
      },
      { key: "codigo", label: "Categoria", before: current.codigo, after: input.code },
    ]
      .filter((change) => change.before !== change.after)
      .map(({ label, before, after }) => ({ label, antes: before, despues: after }));

    if (changes.length) {
      await client.query(
        `
          INSERT INTO stock_modificaciones (
            empleado, producto_id, producto_nombre, cambios, justificacion, empresa_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          session.username,
          id,
          current.nombre,
          JSON.stringify(changes),
          input.justification,
          session.companyId,
        ],
      );
    }

    return {
      data: mapProduct({
        ...current,
        nombre: input.name,
        costo: String(input.cost),
        descripcion: input.description,
        stock: input.stock,
        codigo: input.code,
      }),
      changedFields: changes.length,
    };
  });
}
