import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";

export type ReplenishmentPriority = "critico" | "alto" | "medio" | "sin_movimiento";

export type ReplenishmentItem = {
  productId: string;
  supplierId: string | null;
  sku: string;
  name: string;
  supplier: string;
  unitCost: number;
  currentStock: number;
  pendingPurchase: number;
  sold90: number;
  avgDaily: number;
  coverDays: number | null;
  suggestedQuantity: number;
  priority: ReplenishmentPriority;
};

export type ReplenishmentSuggestions = {
  items: ReplenishmentItem[];
  meta: {
    analyzedProducts: number;
    criticalProducts: number;
    suggestedUnits: number;
    targetDays: number;
    salesWindowDays: number;
  };
};

const SALES_WINDOW_DAYS = 90;
const TARGET_COVER_DAYS = 30;

function priorityFor(stock: number, avgDaily: number, coverDays: number | null): ReplenishmentPriority {
  if (avgDaily <= 0) return "sin_movimiento";
  if (stock <= 0) return "critico";
  if (coverDays !== null && coverDays <= 7) return "alto";
  if (coverDays !== null && coverDays <= TARGET_COVER_DAYS) return "medio";
  return "sin_movimiento";
}

function mapItem(row: {
  product_id: string;
  supplier_id: string | null;
  sku: string | null;
  name: string;
  supplier: string | null;
  unit_cost: string | null;
  current_stock: string;
  pending_purchase: string;
  sold_90: string;
  avg_daily: string;
  cover_days: string | null;
  suggested_quantity: string;
}): ReplenishmentItem {
  const currentStock = Number(row.current_stock);
  const pendingPurchase = Number(row.pending_purchase);
  const avgDaily = Number(row.avg_daily);
  const coverDays = row.cover_days === null ? null : Number(row.cover_days);

  return {
    productId: row.product_id,
    supplierId: row.supplier_id,
    sku: row.sku ?? "",
    name: row.name,
    supplier: row.supplier ?? "Sin proveedor",
    unitCost: Number(row.unit_cost ?? 0),
    currentStock,
    pendingPurchase,
    sold90: Number(row.sold_90),
    avgDaily,
    coverDays,
    suggestedQuantity: Number(row.suggested_quantity),
    priority: priorityFor(currentStock + pendingPurchase, avgDaily, coverDays),
  };
}

export async function getReplenishmentSuggestions(companyId: number): Promise<ReplenishmentSuggestions> {
  const result = await queryWithCompanyContext<Parameters<typeof mapItem>[0]>(
    companyId,
    `
      WITH stock AS (
        SELECT
          p.id AS product_id,
          COALESCE(SUM(
            CASE
              WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
              WHEN sm.movement_type IN ('salida_venta', 'ajuste_negativo') THEN -sm.quantity
              ELSE 0
            END
          ), 0) AS current_stock
        FROM products p
        LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.empresa_id = p.empresa_id
        WHERE p.empresa_id = $1 AND COALESCE(p.active, TRUE) = TRUE
        GROUP BY p.id
      ),
      sales_90 AS (
        SELECT
          si.product_id,
          COALESCE(SUM(si.quantity), 0) AS sold_90
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.empresa_id = si.empresa_id
        WHERE si.empresa_id = $1
          AND si.product_id IS NOT NULL
          AND s.sale_date >= CURRENT_DATE - INTERVAL '90 days'
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
          AND ${canonicalSalesSourceSql("s")}
        GROUP BY si.product_id
      ),
      pending_purchase AS (
        SELECT
          pi.product_id,
          COALESCE(SUM(pi.quantity), 0) AS pending_purchase
        FROM purchase_items pi
        JOIN purchases pu ON pu.id = pi.purchase_id AND pu.empresa_id = pi.empresa_id
        WHERE pi.empresa_id = $1
          AND pi.product_id IS NOT NULL
          AND pu.status = 'pendiente'
          AND LOWER(REPLACE(COALESCE(pu.purchase_type, ''), '-', '_')) <> ALL(
            ARRAY['solicitud','solicitud_compra','solicitud de compra']::text[]
          )
        GROUP BY pi.product_id
      ),
      scored AS (
        SELECT
          p.id::text AS product_id,
          p.supplier_id::text AS supplier_id,
          p.sku,
          p.name,
          s.display_name AS supplier,
          COALESCE(p.cost, 0) AS unit_cost,
          COALESCE(st.current_stock, 0) AS current_stock,
          COALESCE(pp.pending_purchase, 0) AS pending_purchase,
          COALESCE(sa.sold_90, 0) AS sold_90,
          COALESCE(sa.sold_90, 0)::numeric / ${SALES_WINDOW_DAYS}.0 AS avg_daily,
          COALESCE(st.current_stock, 0) + COALESCE(pp.pending_purchase, 0) AS effective_stock
        FROM products p
        LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
        LEFT JOIN stock st ON st.product_id = p.id
        LEFT JOIN sales_90 sa ON sa.product_id = p.id
        LEFT JOIN pending_purchase pp ON pp.product_id = p.id
        WHERE p.empresa_id = $1 AND COALESCE(p.active, TRUE) = TRUE
      )
      SELECT
        product_id,
        supplier_id,
        sku,
        name,
        supplier,
        unit_cost::text,
        current_stock::text,
        pending_purchase::text,
        sold_90::text,
        ROUND(avg_daily, 4)::text AS avg_daily,
        CASE WHEN avg_daily > 0 THEN ROUND(effective_stock / avg_daily, 1)::text ELSE NULL END AS cover_days,
        GREATEST(0, CEIL(avg_daily * ${TARGET_COVER_DAYS}) - effective_stock)::text AS suggested_quantity
      FROM scored
      WHERE avg_daily > 0
        AND (
          effective_stock <= 0
          OR effective_stock / NULLIF(avg_daily, 0) <= ${TARGET_COVER_DAYS}
        )
      ORDER BY
        CASE
          WHEN effective_stock <= 0 THEN 0
          WHEN effective_stock / NULLIF(avg_daily, 0) <= 7 THEN 1
          ELSE 2
        END,
        suggested_quantity DESC,
        sold_90 DESC,
        name ASC
      LIMIT 120
    `,
    [companyId],
  );

  const items = result.rows.map(mapItem);

  return {
    items,
    meta: {
      analyzedProducts: items.length,
      criticalProducts: items.filter((item) => item.priority === "critico").length,
      suggestedUnits: items.reduce((sum, item) => sum + item.suggestedQuantity, 0),
      targetDays: TARGET_COVER_DAYS,
      salesWindowDays: SALES_WINDOW_DAYS,
    },
  };
}
