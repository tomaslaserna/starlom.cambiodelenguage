import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";

export type ReplenishmentPriority = "critico" | "alto" | "medio";
export type ProductTrend = "alza" | "estable" | "baja" | "estancado" | "sin_datos";

export type ReplenishmentItem = {
  productId: string;
  supplierId: string | null;
  sku: string;
  name: string;
  supplier: string;
  unitCost: number;
  currentStock: number;
  pendingPurchase: number;
  effectiveStock: number;
  minimumStock: number;
  safetyStock: number;
  presentationUnits: number;
  replenishmentDays: number;
  demandHorizonDays: number;
  demandHorizon: number;
  sold30: number;
  soldPrevious30: number;
  sold90: number;
  forecastDaily: number;
  coverDays: number | null;
  suggestedQuantity: number;
  suggestedCost: number;
  priority: ReplenishmentPriority | null;
  trend: ProductTrend;
  trendPercent: number | null;
  lastSaleDate: string | null;
  daysSinceLastSale: number | null;
  inventoryValue: number;
};

export type ReplenishmentSuggestions = {
  items: ReplenishmentItem[];
  insights: ReplenishmentItem[];
  meta: {
    analyzedProducts: number;
    suggestedProducts: number;
    criticalProducts: number;
    suggestedUnits: number;
    suggestedValue: number;
    inTransitUnits: number;
    stagnantProducts: number;
    stagnantValue: number;
    growingProducts: number;
    targetDays: number;
    safetyDays: number;
    salesWindowDays: number;
  };
};

const SALES_WINDOW_DAYS = 90;
const TARGET_COVER_DAYS = 30;
const SAFETY_DAYS = 7;

function numeric(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function priorityFor(currentStock: number, coverDays: number | null, suggestedQuantity: number): ReplenishmentPriority | null {
  if (suggestedQuantity <= 0) return null;
  if (currentStock <= 0) return "critico";
  if (coverDays !== null && coverDays <= 7) return "alto";
  return "medio";
}

function trendFor(sold30: number, soldPrevious30: number, sold90: number, currentStock: number): ProductTrend {
  if (sold90 <= 0 && currentStock > 0) return "estancado";
  if (sold30 <= 0 && soldPrevious30 <= 0) return "sin_datos";
  if (soldPrevious30 <= 0 && sold30 > 0) return "alza";
  const variation = sold30 / soldPrevious30;
  if (variation >= 1.2 && sold30 - soldPrevious30 >= 1) return "alza";
  if (variation <= 0.8 && soldPrevious30 - sold30 >= 1) return "baja";
  return "estable";
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
  effective_stock: string;
  minimum_stock: string;
  safety_stock: string;
  presentation_units: string;
  replenishment_days: string;
  demand_horizon_days: string;
  demand_horizon: string;
  sold_30: string;
  sold_previous_30: string;
  sold_90: string;
  forecast_daily: string;
  cover_days: string | null;
  suggested_quantity: string;
  last_sale_date: string | null;
  days_since_last_sale: string | null;
}): ReplenishmentItem {
  const currentStock = numeric(row.current_stock);
  const pendingPurchase = numeric(row.pending_purchase);
  const sold30 = numeric(row.sold_30);
  const soldPrevious30 = numeric(row.sold_previous_30);
  const sold90 = numeric(row.sold_90);
  const suggestedQuantity = numeric(row.suggested_quantity);
  const unitCost = numeric(row.unit_cost);
  const coverDays = row.cover_days === null ? null : numeric(row.cover_days);
  const trendPercent = soldPrevious30 > 0
    ? ((sold30 - soldPrevious30) / soldPrevious30) * 100
    : sold30 > 0
      ? 100
      : null;

  return {
    productId: row.product_id,
    supplierId: row.supplier_id,
    sku: row.sku ?? "",
    name: row.name,
    supplier: row.supplier ?? "Sin proveedor",
    unitCost,
    currentStock,
    pendingPurchase,
    effectiveStock: numeric(row.effective_stock),
    minimumStock: numeric(row.minimum_stock),
    safetyStock: numeric(row.safety_stock),
    presentationUnits: Math.max(1, numeric(row.presentation_units)),
    replenishmentDays: numeric(row.replenishment_days),
    demandHorizonDays: numeric(row.demand_horizon_days),
    demandHorizon: numeric(row.demand_horizon),
    sold30,
    soldPrevious30,
    sold90,
    forecastDaily: numeric(row.forecast_daily),
    coverDays,
    suggestedQuantity,
    suggestedCost: suggestedQuantity * unitCost,
    priority: priorityFor(currentStock, coverDays, suggestedQuantity),
    trend: trendFor(sold30, soldPrevious30, sold90, currentStock),
    trendPercent,
    lastSaleDate: row.last_sale_date,
    daysSinceLastSale: row.days_since_last_sale === null ? null : numeric(row.days_since_last_sale),
    inventoryValue: Math.max(0, currentStock) * unitCost,
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
      sales_history AS (
        SELECT
          si.product_id,
          COALESCE(SUM(si.quantity) FILTER (WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS sold_30,
          COALESCE(SUM(si.quantity) FILTER (
            WHERE s.sale_date < CURRENT_DATE - INTERVAL '30 days'
              AND s.sale_date >= CURRENT_DATE - INTERVAL '60 days'
          ), 0) AS sold_previous_30,
          COALESCE(SUM(si.quantity) FILTER (WHERE s.sale_date >= CURRENT_DATE - INTERVAL '90 days'), 0) AS sold_90,
          MAX(s.sale_date) AS last_sale_date
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.empresa_id = si.empresa_id
        WHERE si.empresa_id = $1
          AND si.product_id IS NOT NULL
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
          AND LOWER(REPLACE(COALESCE(pu.purchase_type, ''), '-', '_')) NOT IN (
            'solicitud', 'solicitud_compra', 'solicitud de compra'
          )
        GROUP BY pi.product_id
      ),
      base AS (
        SELECT
          p.id,
          p.supplier_id,
          p.sku,
          p.name,
          supplier.display_name AS supplier,
          COALESCE(p.cost, 0) AS unit_cost,
          COALESCE(st.current_stock, 0) AS current_stock,
          COALESCE(pp.pending_purchase, 0) AS pending_purchase,
          COALESCE(st.current_stock, 0) + COALESCE(pp.pending_purchase, 0) AS effective_stock,
          GREATEST(COALESCE(p.minimum_stock, 0), 0) AS minimum_stock,
          GREATEST(COALESCE(p.presentation_units, 1), 1) AS presentation_units,
          GREATEST(COALESCE(p.replenishment_days, 0), 0) AS replenishment_days,
          COALESCE(sh.sold_30, 0) AS sold_30,
          COALESCE(sh.sold_previous_30, 0) AS sold_previous_30,
          COALESCE(sh.sold_90, 0) AS sold_90,
          sh.last_sale_date,
          (
            COALESCE(sh.sold_30, 0)::numeric / 30 * 0.60
            + COALESCE(sh.sold_previous_30, 0)::numeric / 30 * 0.30
            + GREATEST(COALESCE(sh.sold_90, 0) - COALESCE(sh.sold_30, 0) - COALESCE(sh.sold_previous_30, 0), 0)::numeric / 30 * 0.10
          ) AS forecast_daily,
          GREATEST(${TARGET_COVER_DAYS}, GREATEST(COALESCE(p.replenishment_days, 0), 0)) AS demand_horizon_days
        FROM products p
        LEFT JOIN suppliers supplier ON supplier.id = p.supplier_id AND supplier.empresa_id = p.empresa_id
        LEFT JOIN stock st ON st.product_id = p.id
        LEFT JOIN sales_history sh ON sh.product_id = p.id
        LEFT JOIN pending_purchase pp ON pp.product_id = p.id
        WHERE p.empresa_id = $1 AND COALESCE(p.active, TRUE) = TRUE
      ),
      scored AS (
        SELECT
          *,
          GREATEST(minimum_stock, CEIL(forecast_daily * ${SAFETY_DAYS})) AS safety_stock,
          CEIL(forecast_daily * demand_horizon_days) AS demand_horizon,
          GREATEST(
            0,
            CEIL(
              GREATEST(
                0,
                CEIL(forecast_daily * demand_horizon_days)
                  + GREATEST(minimum_stock, CEIL(forecast_daily * ${SAFETY_DAYS}))
                  - effective_stock
              ) / presentation_units
            ) * presentation_units
          ) AS suggested_quantity
        FROM base
      )
      SELECT
        id::text AS product_id,
        supplier_id::text,
        sku,
        name,
        supplier,
        unit_cost::text,
        current_stock::text,
        pending_purchase::text,
        effective_stock::text,
        minimum_stock::text,
        safety_stock::text,
        presentation_units::text,
        replenishment_days::text,
        demand_horizon_days::text,
        demand_horizon::text,
        sold_30::text,
        sold_previous_30::text,
        sold_90::text,
        ROUND(forecast_daily, 4)::text AS forecast_daily,
        CASE WHEN forecast_daily > 0 THEN ROUND(effective_stock / forecast_daily, 1)::text ELSE NULL END AS cover_days,
        suggested_quantity::text,
        last_sale_date::text,
        CASE WHEN last_sale_date IS NOT NULL THEN (CURRENT_DATE - last_sale_date)::text ELSE NULL END AS days_since_last_sale
      FROM scored
      ORDER BY suggested_quantity DESC, sold_30 DESC, name ASC
    `,
    [companyId],
    { cache: false },
  );

  const insights = result.rows.map(mapItem);
  const items = insights.filter((item) => item.suggestedQuantity > 0 && item.forecastDaily > 0);
  const stagnant = insights.filter((item) => item.trend === "estancado");

  return {
    items,
    insights,
    meta: {
      analyzedProducts: insights.length,
      suggestedProducts: items.length,
      criticalProducts: items.filter((item) => item.priority === "critico").length,
      suggestedUnits: items.reduce((sum, item) => sum + item.suggestedQuantity, 0),
      suggestedValue: items.reduce((sum, item) => sum + item.suggestedCost, 0),
      inTransitUnits: insights.reduce((sum, item) => sum + item.pendingPurchase, 0),
      stagnantProducts: stagnant.length,
      stagnantValue: stagnant.reduce((sum, item) => sum + item.inventoryValue, 0),
      growingProducts: insights.filter((item) => item.trend === "alza").length,
      targetDays: TARGET_COVER_DAYS,
      safetyDays: SAFETY_DAYS,
      salesWindowDays: SALES_WINDOW_DAYS,
    },
  };
}
