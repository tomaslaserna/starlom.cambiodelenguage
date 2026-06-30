import { ApiError } from "@/lib/api-response";
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

export async function discountSaleStockIfAvailable(
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

  const lines = await client.query<SaleStockLine>(
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

  if (!lines.rowCount) {
    await client.query(
      "UPDATE sales SET stock_discounted = true, updated_at = now() WHERE id = $1::uuid AND empresa_id = $2",
      [saleId, companyId],
    );
    return true;
  }

  const productIds = Array.from(new Set(lines.rows.map((line) => line.product_id)));
  const lockedProducts = await client.query<{ id: string }>(
    "SELECT id::text AS id FROM products WHERE empresa_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE",
    [companyId, productIds],
  );
  if (lockedProducts.rowCount !== productIds.length) {
    throw new ApiError(409, "No se pudo validar el stock de todos los productos del pedido");
  }

  const stock = await client.query<StockRow>(
    `
      SELECT p.id::text AS product_id,
             p.name AS product_name,
             COALESCE(SUM(
               CASE
                 WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
                 WHEN sm.movement_type IN ('salida_venta', 'ajuste_negativo') THEN -sm.quantity
                 ELSE 0
               END
             ), 0)::text AS current_stock
      FROM products p
      LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.empresa_id = p.empresa_id
      WHERE p.empresa_id = $1
        AND p.id = ANY($2::uuid[])
      GROUP BY p.id, p.name
    `,
    [companyId, productIds],
  );
  const stockByProduct = new Map(stock.rows.map((row) => [row.product_id, row]));
  const shortages = lines.rows
    .map((line) => {
      const available = stockNumber(stockByProduct.get(line.product_id)?.current_stock ?? "0");
      const requested = stockNumber(line.quantity);
      return {
        product: stockByProduct.get(line.product_id)?.product_name ?? line.product_name,
        requested,
        available,
      };
    })
    .filter((line) => line.requested > line.available + 0.0001);

  if (shortages.length) {
    const detail = shortages
      .slice(0, 3)
      .map((line) => `${line.product}: pide ${formatStock(line.requested)}, disponible ${formatStock(line.available)}`)
      .join("; ");
    throw new ApiError(409, `Stock insuficiente. ${detail}`);
  }

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
