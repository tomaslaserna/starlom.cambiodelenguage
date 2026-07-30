import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { textField, uuidParam, type RequestBody } from "@/lib/request-body";
import type { StockImportMode, StockImportSourceRow } from "@/lib/stock-import";
import type { PoolClient } from "pg";

const STOCK_EPSILON = 0.0001;
const MAX_MANUAL_STOCK = 1_000_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InventoryProduct = {
  id: string;
  code: string;
  categoryCode: string;
  category: string;
  supplier: string;
  name: string;
  cost: number;
  stock: number;
};

export type StockMovement = {
  id: string;
  productName: string;
  productCode: string;
  mode: "entrada" | "salida";
  type: string;
  quantity: number;
  reason: string;
  actor: string;
  date: string;
};

export type StockImportPreviewRow = StockImportSourceRow & {
  resolvedProductId: string;
  productName: string;
  currentStock: number | null;
  targetStock: number | null;
  delta: number | null;
  status: "lista" | "sin_cambios" | "error";
};

export type StockImportPreview = {
  batchId: string;
  rows: StockImportPreviewRow[];
  ready: number;
  unchanged: number;
  errors: number;
};

function stockNumber(value: string | number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 1_000) / 1_000 : 0;
}

function stockDelta(mode: StockImportMode, quantity: number, currentStock: number) {
  if (mode === "entrada") return quantity;
  if (mode === "salida") return -quantity;
  return quantity - currentStock;
}

function movementTypeForDelta(delta: number) {
  return delta > 0 ? "ajuste_positivo" : "ajuste_negativo";
}

export async function listInventoryProducts(companyId: number, query = "", limit = 40) {
  const normalizedQuery = query.trim();
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const searchFilter = normalizedQuery
    ? `AND (p.name ILIKE '%' || $2 || '%' OR COALESCE(p.sku, '') ILIKE '%' || $2 || '%' OR COALESCE(s.display_name, '') ILIKE '%' || $2 || '%')`
    : "";
  const params = normalizedQuery ? [companyId, normalizedQuery, safeLimit] : [companyId, safeLimit];
  const limitParam = normalizedQuery ? "$3" : "$2";
  const result = await queryWithCompanyContext<{
    id: string;
    sku: string | null;
    category_code: string | null;
    category: string | null;
    supplier: string | null;
    name: string;
    cost: string | null;
    stock: string;
  }>(
    companyId,
    `
      SELECT p.id::text AS id,
             p.sku,
             p.category_code,
             p.category,
             s.display_name AS supplier,
             p.name,
             p.cost::text,
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
      WHERE p.empresa_id = $1
        AND p.active = true
        ${searchFilter}
      ORDER BY p.name ASC, p.id ASC
      LIMIT ${limitParam}
    `,
    params,
  );

  return result.rows.map((row): InventoryProduct => ({
    id: row.id,
    code: row.sku ?? "",
    categoryCode: row.category_code ?? "",
    category: row.category ?? "",
    supplier: row.supplier ?? "",
    name: row.name,
    cost: stockNumber(row.cost),
    stock: stockNumber(row.stock),
  }));
}

export async function getInventorySummary(companyId: number) {
  const result = await queryWithCompanyContext<{ products: string; units: string; without_stock: string }>(
    companyId,
    `
      SELECT COUNT(*)::text AS products,
             COALESCE(SUM(COALESCE(stock.current_stock, 0)), 0)::text AS units,
             COUNT(*) FILTER (WHERE COALESCE(stock.current_stock, 0) <= 0)::text AS without_stock
      FROM products p
      LEFT JOIN (
        SELECT product_id,
               SUM(CASE WHEN movement_type IN ('entrada_compra', 'ajuste_positivo') THEN quantity ELSE -quantity END) AS current_stock
        FROM stock_movements
        WHERE empresa_id = $1
        GROUP BY product_id
      ) stock ON stock.product_id = p.id
      WHERE p.empresa_id = $1 AND p.active = true
    `,
    [companyId],
  );
  const row = result.rows[0];
  return { products: stockNumber(row?.products), units: stockNumber(row?.units), withoutStock: stockNumber(row?.without_stock) };
}

export async function listRecentStockMovements(companyId: number, limit = 60) {
  const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
  const result = await queryWithCompanyContext<{
    id: string;
    product_name: string;
    product_code: string | null;
    movement_type: string;
    quantity: string;
    notes: string | null;
    actor: string | null;
    movement_date: string;
  }>(
    companyId,
    `
      SELECT sm.id::text AS id,
             p.name AS product_name,
             p.sku AS product_code,
             sm.movement_type::text,
             sm.quantity::text,
             sm.notes,
             COALESCE(NULLIF(actor.full_name, ''), NULLIF(actor.username, ''), actor.email, '') AS actor,
             sm.movement_date::text
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id AND p.empresa_id = sm.empresa_id
      LEFT JOIN profiles actor ON actor.id = sm.created_by
      WHERE sm.empresa_id = $1
      ORDER BY sm.movement_date DESC, sm.id DESC
      LIMIT $2
    `,
    [companyId, safeLimit],
  );

  return result.rows.map((row): StockMovement => {
    const inbound = row.movement_type === "entrada_compra" || row.movement_type === "ajuste_positivo";
    return {
      id: row.id,
      productName: row.product_name,
      productCode: row.product_code ?? "",
      mode: inbound ? "entrada" : "salida",
      type: row.movement_type,
      quantity: stockNumber(row.quantity),
      reason: row.notes ?? "",
      actor: row.actor ?? "",
      date: row.movement_date,
    };
  });
}

export function manualStockInputFromBody(body: RequestBody) {
  const productId = uuidParam(textField(body, "productId"), "Producto");
  const modeValue = textField(body, "mode").toLocaleLowerCase("es");
  if (!(["entrada", "salida", "exacto"] as string[]).includes(modeValue)) {
    throw new ApiError(400, "Selecciona entrada, salida o stock exacto");
  }
  const mode = modeValue as StockImportMode;
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity)) throw new ApiError(400, "La cantidad debe ser numerica");
  if (!Number.isInteger(quantity)) throw new ApiError(400, "La cantidad debe ser un numero entero");
  if (mode === "exacto" ? quantity < 0 : quantity <= 0) {
    throw new ApiError(400, mode === "exacto" ? "El stock exacto no puede ser negativo" : "La cantidad debe ser mayor a cero");
  }
  if (quantity > MAX_MANUAL_STOCK) throw new ApiError(400, "La cantidad supera el limite permitido");
  const reason = textField(body, "reason");
  if (reason.length < 5) throw new ApiError(400, "Explica el motivo del movimiento (minimo 5 caracteres)");
  const idempotencyKey = uuidParam(textField(body, "idempotencyKey"), "Identificador de operacion");
  return {
    productId,
    mode,
    quantity: stockNumber(quantity),
    reason,
    idempotencyKey,
  };
}

async function currentStockForProducts(
  client: PoolClient,
  companyId: number,
  productIds: string[],
) {
  if (!productIds.length) return new Map<string, number>();
  const result = await client.query<{ product_id: string; stock: string }>(
    `
      SELECT p.id::text AS product_id,
             COALESCE(SUM(
               CASE
                 WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
                 ELSE -sm.quantity
               END
             ), 0)::text AS stock
      FROM products p
      LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.empresa_id = p.empresa_id
      WHERE p.empresa_id = $1 AND p.id = ANY($2::uuid[])
      GROUP BY p.id
    `,
    [companyId, productIds],
  );
  return new Map(result.rows.map((row) => [row.product_id, stockNumber(row.stock)]));
}

export async function recordManualStockMovement(
  session: AuthSession,
  input: ReturnType<typeof manualStockInputFromBody>,
) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const product = await client.query<{ id: string; name: string }>(
      `
        SELECT id::text AS id, name
        FROM products
        WHERE id = $1::uuid AND empresa_id = $2 AND active = true
        FOR UPDATE
      `,
      [input.productId, session.companyId],
    );
    if (!product.rows[0]) throw new ApiError(404, "Producto no encontrado");

    const previous = await client.query<{ id: string }>(
      "SELECT id::text AS id FROM stock_movements WHERE empresa_id = $1 AND idempotency_key = $2 LIMIT 1",
      [session.companyId, input.idempotencyKey],
    );

    const stockByProduct = await currentStockForProducts(client, session.companyId, [input.productId]);
    const currentStock = stockByProduct.get(input.productId) ?? 0;
    if (previous.rows[0]) {
      return {
        changed: false,
        duplicate: true,
        currentStock,
        targetStock: currentStock,
        productName: product.rows[0].name,
      };
    }
    const delta = stockDelta(input.mode, input.quantity, currentStock);
    const targetStock = stockNumber(currentStock + delta);
    if (targetStock < -STOCK_EPSILON) {
      throw new ApiError(409, `${product.rows[0].name} tiene ${currentStock} unidades; la salida dejaria stock negativo`);
    }
    if (Math.abs(delta) <= STOCK_EPSILON) {
      return { changed: false, duplicate: false, currentStock, targetStock, productName: product.rows[0].name };
    }

    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO stock_movements (
          product_id, movement_type, quantity, notes, created_by, empresa_id, idempotency_key
        )
        VALUES ($1::uuid, $2::stock_movement_type, $3, $4, $5::uuid, $6, $7)
        ON CONFLICT (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
        RETURNING id::text AS id
      `,
      [
        input.productId,
        movementTypeForDelta(delta),
        Math.abs(delta),
        input.reason,
        session.userId,
        session.companyId,
        input.idempotencyKey,
      ],
    );

    return {
      changed: Boolean(inserted.rows[0]),
      duplicate: !inserted.rows[0],
      currentStock,
      targetStock,
      productName: product.rows[0].name,
    };
  });
  clearReadQueryCache();
  return result;
}

type ResolvedProduct = Pick<InventoryProduct, "id" | "code" | "name" | "stock">;

async function resolvedProducts(
  companyId: number,
  rows: StockImportSourceRow[],
  lock = false,
  client?: PoolClient,
) {
  const ids = Array.from(new Set(rows.map((row) => row.productId).filter((id) => UUID_PATTERN.test(id))));
  const codes = Array.from(new Set(rows.map((row) => row.code.toLocaleUpperCase("es")).filter(Boolean)));
  const params: unknown[] = [companyId, ids, codes];
  const sql = `
    SELECT id::text AS id, COALESCE(sku, '') AS code, name
    FROM products
    WHERE empresa_id = $1
      AND active = true
      AND (id = ANY($2::uuid[]) OR UPPER(COALESCE(sku, '')) = ANY($3::text[]))
    ORDER BY id
    ${lock ? "FOR UPDATE" : ""}
  `;
  const result = client
    ? await client.query<{ id: string; code: string; name: string }>(sql, params)
    : await queryWithCompanyContext<{ id: string; code: string; name: string }>(companyId, sql, params);
  return result.rows.map((row): ResolvedProduct => ({ id: row.id, code: row.code, name: row.name, stock: 0 }));
}

function buildStockImportPreview(
  batchId: string,
  rows: StockImportSourceRow[],
  products: ResolvedProduct[],
  stockByProduct: Map<string, number>,
) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const byCode = new Map<string, ResolvedProduct[]>();
  for (const product of products) {
    if (!product.code) continue;
    const key = product.code.toLocaleUpperCase("es");
    byCode.set(key, [...(byCode.get(key) ?? []), product]);
  }
  const seenProducts = new Set<string>();
  const seenRowNumbers = new Set<number>();
  const previewRows = rows.map((row): StockImportPreviewRow => {
    const errors = [...row.errors];
    if (seenRowNumbers.has(row.rowNumber)) errors.push("el numero de fila esta repetido");
    seenRowNumbers.add(row.rowNumber);
    let product = row.productId ? byId.get(row.productId) : undefined;
    if (!product && row.code) {
      const matches = byCode.get(row.code.toLocaleUpperCase("es")) ?? [];
      if (matches.length > 1) errors.push(`el codigo ${row.code} identifica mas de un producto; usa id_producto`);
      else product = matches[0];
    }
    if (!product) errors.push("producto no encontrado");
    if (
      product &&
      row.productId &&
      row.code &&
      product.code.toLocaleUpperCase("es") !== row.code.toLocaleUpperCase("es")
    ) {
      errors.push("id_producto y codigo corresponden a productos distintos");
    }
    if (product && seenProducts.has(product.id)) errors.push("el producto esta repetido en la carga");
    if (product) seenProducts.add(product.id);

    const currentStock = product ? stockByProduct.get(product.id) ?? 0 : null;
    const delta = product && row.mode && row.quantity !== null ? stockDelta(row.mode, row.quantity, currentStock ?? 0) : null;
    const targetStock = delta === null || currentStock === null ? null : stockNumber(currentStock + delta);
    if (targetStock !== null && targetStock < -STOCK_EPSILON) errors.push("la salida dejaria stock negativo");
    const status = errors.length ? "error" : Math.abs(delta ?? 0) <= STOCK_EPSILON ? "sin_cambios" : "lista";

    return {
      ...row,
      errors,
      resolvedProductId: product?.id ?? "",
      productName: product?.name ?? "",
      currentStock,
      targetStock,
      delta,
      status,
    };
  });

  return {
    batchId,
    rows: previewRows,
    ready: previewRows.filter((row) => row.status === "lista").length,
    unchanged: previewRows.filter((row) => row.status === "sin_cambios").length,
    errors: previewRows.filter((row) => row.status === "error").length,
  } satisfies StockImportPreview;
}

export async function previewStockImport(companyId: number, rows: StockImportSourceRow[], batchId: string) {
  uuidParam(batchId, "Lote");
  const products = await resolvedProducts(companyId, rows);
  const productIds = products.map((product) => product.id);
  const stockResult = productIds.length
    ? await queryWithCompanyContext<{ product_id: string; stock: string }>(
        companyId,
        `
          SELECT p.id::text AS product_id,
                 COALESCE(SUM(
                   CASE WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity ELSE -sm.quantity END
                 ), 0)::text AS stock
          FROM products p
          LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.empresa_id = p.empresa_id
          WHERE p.empresa_id = $1 AND p.id = ANY($2::uuid[])
          GROUP BY p.id
        `,
        [companyId, productIds],
      )
    : { rows: [] as { product_id: string; stock: string }[] };
  const stockByProduct = new Map(stockResult.rows.map((row) => [row.product_id, stockNumber(row.stock)]));
  return buildStockImportPreview(batchId, rows, products, stockByProduct);
}

export async function commitStockImport(
  session: AuthSession,
  rows: StockImportSourceRow[],
  batchId: string,
) {
  uuidParam(batchId, "Lote");
  const result = await withCompanyContext(session.companyId, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${session.companyId}:${batchId}`,
    ]);
    const idempotencyKeys = rows.map((row) => `${batchId}:${row.rowNumber}`);
    const existing = await client.query<{ idempotency_key: string }>(
      `
        SELECT idempotency_key
        FROM stock_movements
        WHERE empresa_id = $1
          AND idempotency_key = ANY($2::text[])
      `,
      [session.companyId, idempotencyKeys],
    );
    const existingKeys = new Set(existing.rows.map((row) => row.idempotency_key));
    const pendingRows = rows.filter((row) => !existingKeys.has(`${batchId}:${row.rowNumber}`));
    if (!pendingRows.length) {
      return { inserted: 0, duplicated: rows.length, unchanged: 0, total: rows.length };
    }

    const products = await resolvedProducts(session.companyId, pendingRows, true, client);
    const stockByProduct = await currentStockForProducts(client, session.companyId, products.map((product) => product.id));
    const preview = buildStockImportPreview(batchId, pendingRows, products, stockByProduct);
    const firstError = preview.rows.find((row) => row.status === "error");
    if (firstError) {
      throw new ApiError(409, `Fila ${firstError.rowNumber}: ${firstError.errors.join("; ")}`);
    }

    let inserted = 0;
    let duplicated = rows.length - pendingRows.length;
    for (const row of preview.rows) {
      if (row.status === "sin_cambios" || row.delta === null) continue;
      const movement = await client.query<{ id: string }>(
        `
          INSERT INTO stock_movements (
            product_id, movement_type, quantity, notes, source_sheet, source_row,
            created_by, empresa_id, idempotency_key
          )
          VALUES ($1::uuid, $2::stock_movement_type, $3, $4, $5, $6, $7::uuid, $8, $9)
          ON CONFLICT (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
          RETURNING id::text AS id
        `,
        [
          row.resolvedProductId,
          movementTypeForDelta(row.delta),
          Math.abs(row.delta),
          row.reason,
          `stock-import:${batchId}`,
          row.rowNumber,
          session.userId,
          session.companyId,
          `${batchId}:${row.rowNumber}`,
        ],
      );
      if (movement.rows[0]) inserted++;
      else duplicated++;
    }

    return { inserted, duplicated, unchanged: preview.unchanged, total: rows.length };
  });
  clearReadQueryCache();
  return result;
}
