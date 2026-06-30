import { queryWithCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";

export type Customer = {
  id: string;
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
  id: string;
  productId: string;
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
      `(display_name ILIKE $${params.length} ESCAPE '\\' OR legal_name ILIKE $${params.length} ESCAPE '\\' OR tax_id ILIKE $${params.length} ESCAPE '\\' OR phone ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM clients WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: string;
    external_code: string | null;
    display_name: string;
    legal_name: string | null;
    tax_id: string | null;
    fiscal_condition: string | null;
    phone: string | null;
    locality: string | null;
    province: string | null;
    price_list_name: string | null;
    active: boolean;
    seller_name: string | null;
    payment_term_days: number | null;
  }>(
    companyId,
    `
      SELECT id, external_code, display_name, legal_name, tax_id,
             fiscal_condition, phone, locality, province, price_list_name,
             active, seller_name, payment_term_days
      FROM clients
      WHERE ${where}
      ORDER BY display_name ASC, id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      code: row.external_code ?? "",
      name: row.display_name,
      businessName: row.legal_name ?? "",
      taxIdType: row.tax_id ? "CUIT" : "",
      taxId: row.tax_id ?? "",
      vatCondition: row.fiscal_condition ?? "",
      phone: row.phone ?? "",
      province: row.province ?? "",
      city: row.locality ?? "",
      priceList: row.price_list_name ?? "",
      status: row.active ? "Activo" : "Inactivo",
      seller: row.seller_name ?? "",
      paymentTermDays: row.payment_term_days,
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
  const filters = ["p.empresa_id = $1"];

  if (query) {
    params.push(searchPattern(query));
    filters.push(
      `(p.name ILIKE $${params.length} ESCAPE '\\' OR p.sku ILIKE $${params.length} ESCAPE '\\' OR p.category ILIKE $${params.length} ESCAPE '\\' OR s.display_name ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `
      SELECT COUNT(*)::text AS total
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      WHERE ${where}
    `,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: string;
    sku: string | null;
    category: string | null;
    supplier: string | null;
    name: string;
    cost: string | null;
    stock_real: string;
    reserved: string;
    available: string;
  }>(
    companyId,
    `
      SELECT
        p.id,
        p.sku,
        p.category,
        s.display_name AS supplier,
        p.name,
        p.cost,
        COALESCE(stock.stock_real, 0)::text AS stock_real,
        0::text AS reserved,
        COALESCE(stock.stock_real, 0)::text AS available
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      LEFT JOIN LATERAL (
        SELECT SUM(
          CASE
            WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
            ELSE -sm.quantity
          END
        ) AS stock_real
        FROM stock_movements sm
        WHERE sm.empresa_id = p.empresa_id
          AND sm.product_id = p.id
      ) stock ON true
      WHERE ${where}
      ORDER BY p.name ASC, p.id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      productId: row.id,
      code: row.sku ?? "",
      category: row.category ?? "",
      supplier: row.supplier ?? "",
      name: row.name,
      cost: Number(row.cost ?? 0),
      stockReal: Number(row.stock_real),
      reserved: Number(row.reserved),
      available: Number(row.available),
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
