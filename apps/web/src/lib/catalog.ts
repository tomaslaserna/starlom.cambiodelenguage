import { queryWithCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { productMarginCodeExpression } from "@/lib/product-pricing-sql";
import { publicProductImageUrl } from "@/lib/storage";
import { calculateProductProfit } from "@/lib/product-profit";

export type ProductPrice = {
  name: string;
  price: number;
  profit: number;
  marginPercent: number | null;
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  businessName: string;
  taxIdType: string;
  taxId: string;
  vatCondition: string;
  phone: string;
  address: string;
  province: string;
  city: string;
  priceList: string;
  receiptType: string;
  status: string;
  seller: string;
  observation: string;
  salesCount: number;
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
  presentationUnits: number;
  prices: ProductPrice[];
};

export type ProductSalePrice = {
  id: string;
  code: string;
  category: string;
  supplier: string;
  name: string;
  cost: number;
  imageUrl: string | null;
  presentationUnits: number;
  prices: Record<string, number>;
};

export type SalePricesResult = {
  lists: string[];
  data: ProductSalePrice[];
  meta: {
    companyId: number;
    query: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
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

export type ProductStockTotals = {
  outOfStock: number;
  negativeStock: number;
  inventoryValue: number;
};

export type ProductsResult = ListResult<Product> & {
  stockTotals: ProductStockTotals;
};

const DEFAULT_COMPANY_ID = 1;

// Stock real por producto, derivado de los movimientos. Se reutiliza en la
// consulta paginada y en el agregado de totales para que no diverjan.
const STOCK_MOVEMENTS_LATERAL = `
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
      ) stock ON true`;

function searchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function mapProductPrices(value: unknown, fallbackPrice: string, cost: number): ProductPrice[] {
  const rawPrices = Array.isArray(value) ? value : [];
  const parsed = rawPrices.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const price = Number(row.price);
    return name && Number.isFinite(price) ? [{ name, price }] : [];
  });
  const source = parsed.length ? parsed : [{ name: "General", price: Number(fallbackPrice) || cost }];
  return source.map((item) => {
    const profit = calculateProductProfit(cost, item.price);
    return {
      ...item,
      profit: profit.amount,
      marginPercent: profit.percentOnCost,
    };
  });
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
    receipt_type: string | null;
    active: boolean;
    seller_name: string | null;
    payment_term_days: number | null;
    address: string | null;
    notes: string | null;
    sales_count: string;
  }>(
    companyId,
    `
      SELECT id, external_code, display_name, legal_name, tax_id,
             fiscal_condition, phone, locality, province, price_list_name, receipt_type,
             active, seller_name, payment_term_days, address, notes,
             (SELECT count(*) FROM sales s WHERE s.empresa_id = clients.empresa_id AND s.client_id = clients.id)::text AS sales_count
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
      address: row.address ?? "",
      province: row.province ?? "",
      city: row.locality ?? "",
      priceList: row.price_list_name ?? "",
      receiptType: row.receipt_type ?? "",
      status: row.active ? "Activo" : "Inactivo",
      seller: row.seller_name ?? "",
      observation: row.notes ?? "",
      salesCount: Number(row.sales_count ?? 0),
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

export async function listClientOptions(companyId: number): Promise<{ id: string; name: string }[]> {
  const result = await queryWithCompanyContext<{ id: string; name: string }>(
    companyId,
    `SELECT id::text AS id, COALESCE(NULLIF(display_name, ''), legal_name, 'Sin nombre') AS name
       FROM clients WHERE empresa_id = $1 ORDER BY display_name ASC, id ASC`,
    [companyId],
  );
  return result.rows;
}

export async function listSalePrices(input: ListInput = {}): Promise<SalePricesResult> {
  const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
  const query = input.query?.trim() ?? "";
  const pagination = parsePagination(input);

  const listsResult = await queryWithCompanyContext<{ nombre: string }>(
    companyId,
    `SELECT nombre FROM listas_precio WHERE empresa_id = $1 AND activa = 1 AND (blocked_until IS NULL OR blocked_until < CURRENT_DATE) ORDER BY id ASC`,
    [companyId],
  );
  const lists = listsResult.rows.map((row) => row.nombre);

  const params: unknown[] = [companyId];
  const filters = ["p.empresa_id = $1", "p.active = true"];
  if (query) {
    params.push(searchPattern(query));
    filters.push(
      `(p.name ILIKE $${params.length} ESCAPE '\\' OR p.sku ILIKE $${params.length} ESCAPE '\\' OR p.category ILIKE $${params.length} ESCAPE '\\' OR p.category_code ILIKE $${params.length} ESCAPE '\\' OR s.display_name ILIKE $${params.length} ESCAPE '\\')`,
    );
  }
  const where = filters.join(" AND ");

  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total
     FROM products p
     LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
     WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: string;
    code: string;
    category: string | null;
    supplier: string | null;
    name: string;
    cost: string | null;
    image_path: string | null;
    presentation_units: number;
    list_prices: Record<string, string | number> | null;
  }>(
    companyId,
    `
      SELECT p.id::text AS id,
             COALESCE(p.sku, p.category_code, '') AS code,
             p.category,
             s.display_name AS supplier,
             p.name,
             p.cost,
             p.image_path,
             p.presentation_units,
             COALESCE(price_map.list_prices, '{}'::jsonb) AS list_prices
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
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
        WHERE lp.empresa_id = p.empresa_id AND lp.activa = 1 AND (lp.blocked_until IS NULL OR lp.blocked_until < CURRENT_DATE)
      ) price_map ON true
      WHERE ${where}
      ORDER BY p.name ASC, p.id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

  return {
    lists,
    data: rows.rows.map((row) => ({
      id: row.id,
      code: row.code,
      category: row.category ?? "",
      supplier: row.supplier ?? "",
      name: row.name,
      cost: Number(row.cost ?? 0),
      imageUrl: row.image_path ? publicProductImageUrl(row.image_path) : null,
      presentationUnits: Number(row.presentation_units ?? 1),
      prices: Object.fromEntries(
        Object.entries(row.list_prices ?? {}).map(([name, value]) => [name, Number(value)]),
      ),
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

export async function listStorefrontProducts(companyId = DEFAULT_COMPANY_ID) {
  const result = await queryWithCompanyContext<{
    id: string;
    code: string;
    category: string | null;
    supplier: string | null;
    name: string;
    image_path: string | null;
    available: string;
  }>(
    companyId,
    `SELECT p.id::text AS id,
            COALESCE(p.sku, p.category_code, '') AS code,
            p.category,
            s.display_name AS supplier,
            p.name,
            p.image_path,
            COALESCE(stock.available, 0)::text AS available
       FROM products p
       LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
       LEFT JOIN LATERAL (
         SELECT SUM(
           CASE
             WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
             ELSE -sm.quantity
           END
         ) AS available
           FROM stock_movements sm
          WHERE sm.empresa_id = p.empresa_id
            AND sm.product_id = p.id
       ) stock ON TRUE
      WHERE p.empresa_id = $1 AND p.active = true
      ORDER BY p.name ASC, p.id ASC`,
    [companyId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    code: row.code,
    category: row.category ?? "",
    supplier: row.supplier ?? "",
    name: row.name,
    imageUrl: row.image_path ? publicProductImageUrl(row.image_path) : null,
    availability: Number(row.available) <= 0 ? "out" as const : Number(row.available) <= 5 ? "check" as const : "available" as const,
  }));
}

export async function listProducts(input: ListInput = {}): Promise<ProductsResult> {
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
  const countResult = await queryWithCompanyContext<{
    total: string;
    out_of_stock: string;
    negative_stock: string;
    inventory_value: string;
  }>(
    companyId,
    `
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE COALESCE(stock.stock_real, 0) = 0)::text AS out_of_stock,
        COUNT(*) FILTER (WHERE COALESCE(stock.stock_real, 0) < 0)::text AS negative_stock,
        COALESCE(SUM(GREATEST(COALESCE(stock.stock_real, 0), 0) * COALESCE(p.cost, 0)), 0)::text AS inventory_value
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id${STOCK_MOVEMENTS_LATERAL}
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
    presentation_units: number;
    list_prices: unknown;
    fallback_price: string;
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
        p.presentation_units,
        COALESCE(stock.stock_real, 0)::text AS stock_real,
        0::text AS reserved,
        COALESCE(stock.stock_real, 0)::text AS available,
        COALESCE(price_map.list_prices, '[]'::jsonb) AS list_prices,
        COALESCE(
          NULLIF(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_1, 1), 2), 0),
          p.sale_price,
          p.cost,
          0
        )::text AS fallback_price
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      LEFT JOIN margenes m
        ON m.empresa_id = p.empresa_id
       AND m.codigo = ${productMarginCodeExpression("p")}
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', lp.nombre,
            'price', COALESCE(
              NULLIF(ROUND(COALESCE(p.cost, 0) * NULLIF(ml.multiplicador, 1), 2), 0),
              NULLIF(ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_1, 1), 2), 0),
              p.sale_price,
              p.cost,
              0
            )
          )
          ORDER BY lp.orden ASC, lp.nombre ASC
        ) AS list_prices
        FROM listas_precio lp
        LEFT JOIN margenes_listas ml
          ON ml.empresa_id = lp.empresa_id
         AND ml.lista_id = lp.id
         AND ml.codigo = ${productMarginCodeExpression("p")}
        WHERE lp.empresa_id = p.empresa_id AND lp.activa = 1 AND (lp.blocked_until IS NULL OR lp.blocked_until < CURRENT_DATE)
      ) price_map ON true${STOCK_MOVEMENTS_LATERAL}
      WHERE ${where}
      ORDER BY p.name ASC, p.id ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const totalsRow = countResult.rows[0];
  const total = Number.parseInt(totalsRow?.total ?? "0", 10);
  const stockTotals: ProductStockTotals = {
    outOfStock: Number.parseInt(totalsRow?.out_of_stock ?? "0", 10),
    negativeStock: Number.parseInt(totalsRow?.negative_stock ?? "0", 10),
    inventoryValue: Number(totalsRow?.inventory_value ?? "0"),
  };

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
      presentationUnits: Number(row.presentation_units ?? 1),
      prices: mapProductPrices(row.list_prices, row.fallback_price, Number(row.cost ?? 0)),
    })),
    meta: {
      companyId,
      query,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
    stockTotals,
  };
}

export async function listProductCategories(companyId: number) {
  const result = await queryWithCompanyContext<{ category: string }>(
    companyId,
    `SELECT DISTINCT trim(category) AS category
       FROM products
      WHERE empresa_id = $1 AND active = true AND NULLIF(trim(category), '') IS NOT NULL
      ORDER BY category ASC`,
    [companyId],
  );
  return result.rows.map((row) => row.category);
}

export async function updateProductPresentation(companyId: number, productId: string, presentationUnits: number) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `UPDATE products SET presentation_units = $3, updated_at = now()
      WHERE empresa_id = $1 AND id = $2::uuid RETURNING id::text AS id`,
    [companyId, productId, presentationUnits],
  );
  if (!result.rows[0]) throw new Error("Producto no encontrado");
}
