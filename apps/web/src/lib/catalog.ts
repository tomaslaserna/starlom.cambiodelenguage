import { queryWithCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";

export type Customer = {
  id: number;
  code: string;
  name: string;
  businessName: string;
  taxIdType: string;
  taxId: string;
  vatCondition: string;
  phone: string;
  province: string;
  city: string;
  priceList: string;
  status: string;
  seller: string;
  paymentTermDays: number | null;
};

export type Product = {
  id: number;
  productId: number;
  code: string;
  category: string;
  supplier: string;
  name: string;
  cost: number;
  stockReal: number;
  reserved: number;
  available: number;
};

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

const DEFAULT_COMPANY_ID = 1;

function searchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export async function listCustomers(input: ListInput = {}): Promise<ListResult<Customer>> {
  const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
  const query = input.query?.trim() ?? "";
  const pagination = parsePagination(input);
  const params: unknown[] = [companyId];
  const filters = ["empresa_id = $1"];

  if (query) {
    params.push(searchPattern(query));
    filters.push(
      `(nombre_cliente ILIKE $${params.length} ESCAPE '\\' OR razon_social ILIKE $${params.length} ESCAPE '\\' OR nro_id ILIKE $${params.length} ESCAPE '\\' OR telefono ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM clientes WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: number;
    codigo_cliente: string;
    nombre_cliente: string;
    razon_social: string;
    tipo_id: string;
    nro_id: string;
    cond_iva: string;
    telefono: string;
    provincia: string;
    ciudad: string;
    lista_precios: string;
    estado: string;
    vendedor_cl: string;
  }>(
    companyId,
    `
      SELECT id, codigo_cliente, nombre_cliente, razon_social, tipo_id, nro_id,
             cond_iva, telefono, provincia, ciudad, lista_precios, estado,
             vendedor_cl
      FROM clientes
      WHERE ${where}
      ORDER BY nombre_cliente ASC, id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      code: row.codigo_cliente,
      name: row.nombre_cliente,
      businessName: row.razon_social,
      taxIdType: row.tipo_id,
      taxId: row.nro_id,
      vatCondition: row.cond_iva,
      phone: row.telefono,
      province: row.provincia,
      city: row.ciudad,
      priceList: row.lista_precios,
      status: row.estado,
      seller: row.vendedor_cl,
      paymentTermDays: null,
    })),
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

export async function listProducts(input: ListInput = {}): Promise<ListResult<Product>> {
  const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
  const query = input.query?.trim() ?? "";
  const pagination = parsePagination(input);
  const params: unknown[] = [companyId];
  const filters = ["empresa_id = $1"];

  if (query) {
    params.push(searchPattern(query));
    filters.push(
      `(nombre ILIKE $${params.length} ESCAPE '\\' OR codigo ILIKE $${params.length} ESCAPE '\\' OR categoria ILIKE $${params.length} ESCAPE '\\' OR proveedor ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM vista_stock_disponible WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: number;
    id_producto: number;
    codigo: string;
    categoria: string;
    proveedor: string;
    nombre: string;
    costo: string;
    stock_real: number;
    reservado: string;
    disponible: string;
  }>(
    companyId,
    `
      SELECT id, id_producto, codigo, categoria, proveedor, nombre, costo,
             stock_real, reservado, disponible
      FROM vista_stock_disponible
      WHERE ${where}
      ORDER BY nombre ASC, id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      productId: row.id_producto,
      code: row.codigo,
      category: row.categoria,
      supplier: row.proveedor,
      name: row.nombre,
      cost: Number(row.costo),
      stockReal: row.stock_real,
      reserved: Number(row.reservado),
      available: Number(row.disponible),
    })),
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
