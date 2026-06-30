import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";

function monthBounds(date = new Date()) {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));

  return {
    currentStart: current.toISOString().slice(0, 10),
    nextStart: next.toISOString().slice(0, 10),
    previousStart: previous.toISOString().slice(0, 10),
  };
}

function percentDelta(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

type AdminMetrics = {
  period: ReturnType<typeof monthBounds>;
  sales: { current: number; previous: number; deltaPercent: number | null };
  collections: { current: number; previous: number; deltaPercent: number | null };
  margin: { grossCost: number; grossProfit: number; operatingCosts: number; operatingResult: number };
  stock: { value: number; units: number; products: number };
  purchases: { current: number; openTotal: number };
  receivables: { openTotal: number };
};

const ADMIN_METRICS_CACHE_TTL_MS = 120_000;
const adminMetricsCache = new Map<number, { expiresAt: number; value: AdminMetrics }>();

export async function getAdminMetrics(companyId: number): Promise<AdminMetrics> {
  const cached = adminMetricsCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await loadAdminMetrics(companyId).catch((error) => {
    if (cached) return cached.value;
    throw error;
  });
  adminMetricsCache.set(companyId, {
    expiresAt: Date.now() + ADMIN_METRICS_CACHE_TTL_MS,
    value,
  });
  return value;
}

async function loadAdminMetrics(companyId: number): Promise<AdminMetrics> {
  const bounds = monthBounds();
  const result = await queryWithCompanyContext<{
    sales_current: string;
    sales_previous: string;
    collections_current: string;
    collections_previous: string;
    gross_cost_current: string;
    gross_cost_previous: string;
    stock_value: string;
    stock_units: string;
    stock_products: string;
    operating_costs_current: string;
    purchases_current: string;
    open_sales_total: string;
    open_purchases_total: string;
  }>(
    companyId,
    `
      WITH sales_summary AS (
        SELECT
          COALESCE(SUM(total_amount) FILTER (
            WHERE sale_date >= $2 AND sale_date < $3
              AND ${normalizedOrderStatusSql("s")} = 'entregado'
          ), 0) AS sales_current,
          COALESCE(SUM(total_amount) FILTER (
            WHERE sale_date >= $1 AND sale_date < $2
              AND ${normalizedOrderStatusSql("s")} = 'entregado'
          ), 0) AS sales_previous,
          COALESCE(SUM(total_amount) FILTER (
            WHERE COALESCE(collection_status,'pendiente') IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')
              AND ${normalizedOrderStatusSql("s")} = 'entregado'
          ), 0) AS open_sales_total
        FROM sales s
        WHERE s.empresa_id = $4
          AND ${canonicalSalesSourceSql("s")}
      ),
      payments_summary AS (
        SELECT
          COALESCE(SUM(amount) FILTER (
            WHERE payment_date >= $2 AND payment_date < $3
              AND COALESCE(status::text, 'registrado') NOT IN ('cancelado','rechazado')
          ), 0) AS collections_current,
          COALESCE(SUM(amount) FILTER (
            WHERE payment_date >= $1 AND payment_date < $2
              AND COALESCE(status::text, 'registrado') NOT IN ('cancelado','rechazado')
          ), 0) AS collections_previous
        FROM payments
        WHERE empresa_id = $4
      ),
      costs AS (
        SELECT
          COALESCE(SUM(COALESCE(v.source_cost_amount, line_totals.item_cost, 0)) FILTER (
            WHERE v.sale_date >= $2 AND v.sale_date < $3
              AND ${normalizedOrderStatusSql("v")} = 'entregado'
          ), 0) AS gross_cost_current,
          COALESCE(SUM(COALESCE(v.source_cost_amount, line_totals.item_cost, 0)) FILTER (
            WHERE v.sale_date >= $1 AND v.sale_date < $2
              AND ${normalizedOrderStatusSql("v")} = 'entregado'
          ), 0) AS gross_cost_previous
        FROM sales v
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(dv.quantity * COALESCE(p.cost, 0)), 0) AS item_cost
          FROM sale_items dv
          LEFT JOIN products p ON p.id = dv.product_id AND p.empresa_id = dv.empresa_id
          WHERE dv.sale_id = v.id AND dv.empresa_id = v.empresa_id
        ) line_totals ON true
        WHERE v.empresa_id = $4
          AND ${canonicalSalesSourceSql("v")}
      ),
      stock AS (
        SELECT COALESCE(SUM(current_stock * COALESCE(cost, 0)) FILTER (WHERE current_stock > 0), 0) AS stock_value,
               COALESCE(SUM(current_stock) FILTER (WHERE current_stock > 0), 0) AS stock_units,
               COUNT(*) FILTER (WHERE current_stock <= 0) AS stock_products
        FROM (
          SELECT p.id, p.cost,
                 COALESCE(SUM(
                   CASE
                     WHEN sm.movement_type IN ('entrada_compra', 'ajuste_positivo') THEN sm.quantity
                     ELSE -sm.quantity
                   END
                 ), 0) AS current_stock
          FROM products p
          LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.empresa_id = p.empresa_id
          WHERE p.empresa_id = $4 AND p.active = true
          GROUP BY p.id, p.cost
        ) product_stock
      ),
      operating AS (
        SELECT COALESCE(SUM(monto), 0) AS operating_costs_current
        FROM costos_operativos
        WHERE empresa_id = $4 AND fecha >= $2 AND fecha < $3
      ),
      salaries AS (
        SELECT COALESCE(
          SUM(
            sueldo_mensual
            + CASE WHEN COALESCE(aguinaldo_aplica, TRUE) THEN sueldo_mensual / 12 ELSE 0 END
            + sueldo_mensual * (COALESCE(cargas_pct, 0) / 100)
          ),
          0
        ) AS salaries_current
        FROM admin_sueldos_config
        WHERE empresa_id = $4 AND activo = TRUE
      ),
      purchases AS (
        SELECT COALESCE(SUM(total_amount) FILTER (WHERE purchase_date >= $2 AND purchase_date < $3), 0) AS purchases_current,
               COALESCE(SUM(GREATEST(total_amount - COALESCE(paid_amount, 0), 0)) FILTER (
                 WHERE status <> 'cancelada'
               ), 0) AS open_purchases_total
        FROM purchases
        WHERE empresa_id = $4
      )
      SELECT sales_current::text, sales_previous::text,
             collections_current::text, collections_previous::text,
             gross_cost_current::text, gross_cost_previous::text,
             stock_value::text, stock_units::text, stock_products::text,
             (operating_costs_current + salaries_current)::text AS operating_costs_current,
             purchases_current::text,
             open_sales_total::text, open_purchases_total::text
      FROM sales_summary, payments_summary, costs, stock, operating, salaries, purchases
    `,
    [bounds.previousStart, bounds.currentStart, bounds.nextStart, companyId],
  );

  const row = result.rows[0];
  const salesCurrent = Number(row.sales_current);
  const salesPrevious = Number(row.sales_previous);
  const grossCostCurrent = Number(row.gross_cost_current);
  const operatingCosts = Number(row.operating_costs_current);

  return {
    period: bounds,
    sales: {
      current: salesCurrent,
      previous: salesPrevious,
      deltaPercent: percentDelta(salesCurrent, salesPrevious),
    },
    collections: {
      current: Number(row.collections_current),
      previous: Number(row.collections_previous),
      deltaPercent: percentDelta(Number(row.collections_current), Number(row.collections_previous)),
    },
    margin: {
      grossCost: grossCostCurrent,
      grossProfit: salesCurrent - grossCostCurrent,
      operatingCosts,
      operatingResult: salesCurrent - grossCostCurrent - operatingCosts,
    },
    stock: {
      value: Number(row.stock_value),
      units: Number(row.stock_units),
      products: Number(row.stock_products),
    },
    purchases: {
      current: Number(row.purchases_current),
      openTotal: Number(row.open_purchases_total),
    },
    receivables: {
      openTotal: Number(row.open_sales_total),
    },
  };
}

export async function getAccountsPayable(companyId: number) {
  const purchases = await queryWithCompanyContext<{
    id: string;
    provider: string;
    concept: string;
    total: string;
    paid: string;
    balance: string;
    date: string | null;
    status: string;
  }>(
    companyId,
    `
      SELECT p.id,
             COALESCE(s.display_name, 'Compra #' || p.id::text) AS provider,
             COALESCE(p.description, 'Compra pendiente') AS concept,
             p.total_amount::text AS total,
             COALESCE(p.paid_amount, 0)::text AS paid,
             GREATEST(p.total_amount - COALESCE(p.paid_amount, 0), 0)::text AS balance,
             p.purchase_date::text AS date,
             p.status AS status
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      WHERE p.empresa_id = $1
        AND p.status = 'recibida'
        AND GREATEST(p.total_amount - COALESCE(p.paid_amount, 0), 0) > 0
      ORDER BY p.purchase_date ASC NULLS LAST, p.created_at ASC
    `,
    [companyId],
  );

  const currentStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const nextStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);

  const salaries = await queryWithCompanyContext<{
    id: string;
    employee: string;
    monthly: string;
    bonus: string;
    charges: string;
    paid: string;
  }>(
    companyId,
    `
      SELECT c.id,
             COALESCE(p.full_name, p.username, c.employee_name, 'Empleado #' || c.id::text) AS employee,
             c.sueldo_mensual::text AS monthly,
             CASE WHEN COALESCE(c.aguinaldo_aplica, TRUE) THEN (c.sueldo_mensual / 12)::text ELSE '0' END AS bonus,
             (c.sueldo_mensual * (COALESCE(c.cargas_pct, 0) / 100))::text AS charges,
             COALESCE(SUM(m.monto) FILTER (
               WHERE m.periodo >= $2 AND m.periodo < $3 AND m.tipo IN ('pago','retiro')
             ), 0)::text AS paid
      FROM admin_sueldos_config c
      LEFT JOIN profiles p ON p.id = c.profile_id
      LEFT JOIN admin_sueldo_movimientos m
        ON m.empresa_id = c.empresa_id AND m.profile_id IS NOT DISTINCT FROM c.profile_id
      WHERE c.empresa_id = $1 AND c.activo = TRUE
      GROUP BY c.id, c.profile_id, p.full_name, p.username, c.employee_name, c.sueldo_mensual,
               c.aguinaldo_aplica, c.cargas_pct
      ORDER BY employee ASC
    `,
    [companyId, currentStart, nextStart],
  );

  const taxes = await queryWithCompanyContext<{
    id: number;
    provider: string;
    concept: string;
    balance: string;
    date: string | null;
    status: string;
  }>(
    companyId,
    `
      SELECT id,
             'AFIP / Contador' AS provider,
             impuesto || ' - periodo ' || periodo::text AS concept,
             monto_estimado::text AS balance,
             vencimiento::text AS date,
             estado AS status
      FROM admin_obligaciones_fiscales
      WHERE empresa_id = $1
        AND estado IN ('pendiente','vencido','revisar')
        AND monto_estimado > 0
      ORDER BY vencimiento ASC, id ASC
    `,
    [companyId],
  );

  const projectedServices = await queryWithCompanyContext<{
    id: number;
    provider: string;
    concept: string;
    balance: string;
    date: string | null;
    status: string;
  }>(
    companyId,
    `
      SELECT id,
             'Servicio / gasto operativo' AS provider,
             concepto AS concept,
             monto::text AS balance,
             fecha::text AS date,
             'proyectado' AS status
      FROM costos_operativos
      WHERE empresa_id = $1
        AND fecha >= CURRENT_DATE
        AND monto > 0
        AND (
          categoria ILIKE '%servicio%'
          OR concepto ILIKE '%servicio%'
          OR concepto ILIKE '%alquiler%'
          OR concepto ILIKE '%luz%'
          OR concepto ILIKE '%gas%'
          OR concepto ILIKE '%internet%'
        )
      ORDER BY fecha ASC, id ASC
    `,
    [companyId],
  );

  const data = [
    ...purchases.rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    concept: row.concept,
    total: Number(row.total),
    paid: Number(row.paid),
    balance: Number(row.balance),
    date: row.date,
    status: row.status,
    source: "compra",
  })),
    ...salaries.rows
      .map((row) => {
        const total = Number(row.monthly) + Number(row.bonus) + Number(row.charges);
        const paid = Number(row.paid);
        return {
          id: row.id,
          provider: row.employee,
          concept: "Sueldo vigente + aguinaldo proporcional + cargas",
          total,
          paid,
          balance: Math.max(0, total - paid),
          date: nextStart,
          status: "sueldo",
          source: "sueldo",
        };
      })
      .filter((row) => row.balance > 0),
    ...taxes.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      concept: row.concept,
      total: Number(row.balance),
      paid: 0,
      balance: Number(row.balance),
      date: row.date,
      status: row.status,
      source: "impuesto",
    })),
    ...projectedServices.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      concept: row.concept,
      total: Number(row.balance),
      paid: 0,
      balance: Number(row.balance),
      date: row.date,
      status: row.status,
      source: "servicio",
    })),
  ].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));

  return {
    data,
    meta: {
      count: data.length,
      total: data.reduce((sum, item) => sum + item.balance, 0),
    },
  };
}

export async function getCashflow(companyId: number) {
  const receivables = await queryWithCompanyContext<{
    id: string;
    label: string;
    amount: string;
    date: string | null;
    kind: string;
  }>(
    companyId,
    `
      SELECT id,
             COALESCE(client_name, 'Venta #' || COALESCE(sale_number, id::text)) AS label,
             total_amount::text AS amount,
             sale_date::text AS date,
             'inflow' AS kind
      FROM sales
      WHERE empresa_id = $1
        AND ${canonicalSalesSourceSql("sales")}
        AND COALESCE(collection_status,'pendiente') IN ('pendiente','vencido','en_proceso','pendiente_aprobacion')
        AND ${normalizedOrderStatusSql("sales")} = 'entregado'
    `,
    [companyId],
  );

  const payables = await queryWithCompanyContext<{
    id: number;
    label: string;
    amount: string;
    date: string | null;
    kind: string;
  }>(
    companyId,
    `
      SELECT p.id,
             COALESCE(s.display_name, 'Compra #' || p.id::text) AS label,
             GREATEST(p.total_amount - COALESCE(p.paid_amount, 0), 0)::text AS amount,
             p.purchase_date::text AS date,
             'outflow' AS kind
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      WHERE p.empresa_id = $1
        AND p.status <> 'cancelada'
        AND GREATEST(p.total_amount - COALESCE(p.paid_amount, 0), 0) > 0
    `,
    [companyId],
  );

  const salaryOutflows = await queryWithCompanyContext<{
    id: number;
    label: string;
    amount: string;
    date: string | null;
    kind: string;
  }>(
    companyId,
    `
      SELECT c.id,
             COALESCE(p.full_name, p.username, c.employee_name, 'Empleado #' || c.id::text) AS label,
             (
               c.sueldo_mensual
               + CASE WHEN COALESCE(c.aguinaldo_aplica, TRUE) THEN c.sueldo_mensual / 12 ELSE 0 END
               + c.sueldo_mensual * (COALESCE(c.cargas_pct, 0) / 100)
             )::text AS amount,
             (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date::text AS date,
             'outflow' AS kind
      FROM admin_sueldos_config c
      LEFT JOIN profiles p ON p.id = c.profile_id
      WHERE c.empresa_id = $1 AND c.activo = TRUE
    `,
    [companyId],
  );

  const taxOutflows = await queryWithCompanyContext<{
    id: number;
    label: string;
    amount: string;
    date: string | null;
    kind: string;
  }>(
    companyId,
    `
      SELECT id,
             impuesto || ' - ' || periodo::text AS label,
             monto_estimado::text AS amount,
             vencimiento::text AS date,
             'outflow' AS kind
      FROM admin_obligaciones_fiscales
      WHERE empresa_id = $1
        AND estado IN ('pendiente','vencido','revisar')
        AND monto_estimado > 0
    `,
    [companyId],
  );

  const projectedOutflows = await queryWithCompanyContext<{
    id: number;
    label: string;
    amount: string;
    date: string | null;
    kind: string;
  }>(
    companyId,
    `
      SELECT id,
             concepto AS label,
             monto::text AS amount,
             fecha::text AS date,
             'outflow' AS kind
      FROM costos_operativos
      WHERE empresa_id = $1
        AND fecha >= CURRENT_DATE
        AND monto > 0
    `,
    [companyId],
  );

  const items = [
    ...receivables.rows,
    ...payables.rows,
    ...salaryOutflows.rows,
    ...taxOutflows.rows,
    ...projectedOutflows.rows,
  ]
    .map((row) => ({
      id: row.id,
      label: row.label,
      amount: Number(row.amount),
      date: row.date,
      kind: row.kind,
    }))
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));

  const inflow = items.filter((item) => item.kind === "inflow").reduce((sum, item) => sum + item.amount, 0);
  const outflow = items.filter((item) => item.kind === "outflow").reduce((sum, item) => sum + item.amount, 0);

  return {
    data: items,
    meta: {
      inflow,
      outflow,
      net: inflow - outflow,
    },
  };
}
