import { ApiError } from "@/lib/api-response";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import type { PoolClient } from "pg";

type SaleStockLine = {
  product_id: string;
  product_name: string;
  quantity: string;
};

type StockRow = {
  product_id: string;
  product_name: string;
  current_stock: string;
};

function stockNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatStock(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

async function getSaleStockLines(client: PoolClient, companyId: number, saleId: string) {
  return client.query<SaleStockLine>(
    `
      SELECT si.product_id::text,
             COALESCE(p.name, MIN(si.description), si.product_id::text) AS product_name,
             SUM(si.quantity)::text AS quantity
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
      WHERE si.sale_id = $1::uuid
        AND si.empresa_id = $2
        AND si.product_id IS NOT NULL
      GROUP BY si.product_id, p.name
      HAVING SUM(si.quantity) > 0
    `,
    [saleId, companyId],
  );
}

async function lockSaleProducts(client: PoolClient, companyId: number, lines: SaleStockLine[]) {
  const productIds = Array.from(new Set(lines.map((line) => line.product_id))).sort();
  const lockedProducts = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM products
      WHERE empresa_id = $1 AND id = ANY($2::uuid[])
      ORDER BY id
      FOR UPDATE
    `,
    [companyId, productIds],
  );
  if (lockedProducts.rowCount !== productIds.length) {
    throw new ApiError(409, "No se pudo validar el stock de todos los productos del pedido");
  }
  return productIds;
}

function throwIfStockIsInsufficient(
  lines: SaleStockLine[],
  availability: Map<string, { product: string; available: number }>,
) {
  const shortages = lines
    .map((line) => {
      const stock = availability.get(line.product_id);
      return {
        product: stock?.product ?? line.product_name,
        requested: stockNumber(line.quantity),
        available: Math.max(0, stock?.available ?? 0),
      };
    })
    .filter((line) => line.requested > line.available + 0.0001);

  if (!shortages.length) return;
  const detail = shortages
    .slice(0, 3)
    .map((line) => `${line.product}: pide ${formatStock(line.requested)}, disponible ${formatStock(line.available)}`)
    .join("; ");
  throw new ApiError(409, `Stock insuficiente. ${detail}`);
}

export async function assertSaleStockAvailableForConfirmation(
  client: PoolClient,
  companyId: number,
  saleId: string,
) {
  const lines = await getSaleStockLines(client, companyId, saleId);
  if (!lines.rowCount) return;

  const productIds = await lockSaleProducts(client, companyId, lines.rows);
  const stock = await client.query<StockRow & { reserved_stock: string }>(
    `
      SELECT p.id::text AS product_id,
             p.name AS product_name,
             COALESCE(SUM(
               CASE
                 WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
                 WHEN sm.movement_type IN ('salida_venta', 'ajuste_negativo') THEN -sm.quantity
                 ELSE 0
               END
             ), 0)::text AS current_stock,
             COALESCE((
               SELECT SUM(si.quantity)
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id AND s.empresa_id = si.empresa_id
               WHERE si.empresa_id = p.empresa_id
                 AND si.product_id = p.id
                 AND s.id <> $3::uuid
                 AND ${normalizedOrderStatusSql("s")} = 'confirmado'
                 AND COALESCE(s.stock_discounted, false) = false
             ), 0)::text AS reserved_stock
      FROM products p
      LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.empresa_id = p.empresa_id
      WHERE p.empresa_id = $1
        AND p.id = ANY($2::uuid[])
      GROUP BY p.id, p.name
    `,
    [companyId, productIds, saleId],
  );
  throwIfStockIsInsufficient(
    lines.rows,
    new Map(
      stock.rows.map((row) => [
        row.product_id,
        {
          product: row.product_name,
          available: stockNumber(row.current_stock) - stockNumber(row.reserved_stock),
        },
      ]),
    ),
  );
}

export async function discountSaleStockOnDelivery(
  client: PoolClient,
  companyId: number,
  saleId: string,
  notes: string,
) {
  const sale = await client.query<{ stock_discounted: boolean }>(
    `
      SELECT stock_discounted
      FROM sales
      WHERE id = $1::uuid AND empresa_id = $2
      FOR UPDATE
    `,
    [saleId, companyId],
  );
  if (!sale.rows[0]) throw new ApiError(404, "Pedido no encontrado");
  if (sale.rows[0].stock_discounted) return false;

  const lines = await getSaleStockLines(client, companyId, saleId);

  if (!lines.rowCount) {
    await client.query(
      "UPDATE sales SET stock_discounted = true, updated_at = now() WHERE id = $1::uuid AND empresa_id = $2",
      [saleId, companyId],
    );
    return true;
  }

  // Todavia no hay un inventario inicial confiable. Conservamos el bloqueo de
  // productos y el movimiento de salida, pero la entrega no se frena por saldo.
  await lockSaleProducts(client, companyId, lines.rows);

  for (const line of lines.rows) {
    await client.query(
      `
        INSERT INTO stock_movements (product_id, movement_type, quantity, sale_id, notes, empresa_id)
        VALUES ($1::uuid, 'salida_venta', $2, $3::uuid, $4, $5)
      `,
      [line.product_id, stockNumber(line.quantity), saleId, notes, companyId],
    );
  }

  await client.query(
    "UPDATE sales SET stock_discounted = true, updated_at = now() WHERE id = $1::uuid AND empresa_id = $2",
    [saleId, companyId],
  );
  return true;
}

export async function restoreSaleStock(
  client: PoolClient,
  companyId: number,
  saleId: string,
  notes: string,
) {
  const sale = await client.query<{ stock_discounted: boolean }>(
    `
      SELECT stock_discounted
      FROM sales
      WHERE id = $1::uuid AND empresa_id = $2
      FOR UPDATE
    `,
    [saleId, companyId],
  );
  if (!sale.rows[0]) throw new ApiError(404, "Venta no encontrada");
  if (!sale.rows[0].stock_discounted) return false;

  const lines = await client.query<{ product_id: string; quantity: string }>(
    `
      SELECT si.product_id::text, SUM(si.quantity)::text AS quantity
      FROM sale_items si
      WHERE si.sale_id = $1::uuid
        AND si.empresa_id = $2
        AND si.product_id IS NOT NULL
      GROUP BY si.product_id
      HAVING SUM(si.quantity) > 0
    `,
    [saleId, companyId],
  );

  for (const line of lines.rows) {
    await client.query(
      `
        INSERT INTO stock_movements (product_id, movement_type, quantity, notes, empresa_id)
        VALUES ($1::uuid, 'ajuste_positivo', $2, $3, $4)
      `,
      [line.product_id, Number(line.quantity), notes, companyId],
    );
  }

  await client.query(
    "UPDATE sales SET stock_discounted = false, updated_at = now() WHERE id = $1::uuid AND empresa_id = $2",
    [saleId, companyId],
  );
  return true;
}
