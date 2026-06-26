import { queryWithCompanyContext } from "@/lib/db";

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
const ADMIN_METRICS_FAST_TIMEOUT_MS = 50;
const adminMetricsCache = new Map<number, { expiresAt: number; value: AdminMetrics }>();

function emptyAdminMetrics(): AdminMetrics {
  return {
    period: monthBounds(),
    sales: { current: 0, previous: 0, deltaPercent: null },
    collections: { current: 0, previous: 0, deltaPercent: null },
    margin: { grossCost: 0, grossProfit: 0, operatingCosts: 0, operatingResult: 0 },
    stock: { value: 0, units: 0, products: 0 },
    purchases: { current: 0, openTotal: 0 },
    receivables: { openTotal: 0 },
  };
}

export async function getAdminMetrics(companyId: number): Promise<AdminMetrics> {
  const cached = adminMetricsCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const loadPromise = loadAdminMetrics(companyId)
    .then((value) => {
      adminMetricsCache.set(companyId, {
        expiresAt: Date.now() + ADMIN_METRICS_CACHE_TTL_MS,
        value,
      });
      return value;
    })
    .catch((error) => {
      if (cached) return cached.value;
      throw error;
    });

  if (cached) return cached.value;

  return Promise.race([
    loadPromise,
    new Promise<AdminMetrics>((resolve) => setTimeout(() => resolve(emptyAdminMetrics()), ADMIN_METRICS_FAST_TIMEOUT_MS)),
  ]);
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
      WITH sales AS (
        SELECT
          COALESCE(SUM(monto) FILTER (
            WHERE fecha >= $2 AND fecha < $3 AND COALESCE(estado_pedido,'entregado') = 'entregado'
          ), 0) AS sales_current,
          COALESCE(SUM(monto) FILTER (
            WHERE fecha >= $1 AND fecha < $2 AND COALESCE(estado_pedido,'entregado') = 'entregado'
          ), 0) AS sales_previous,
          COALESCE(SUM(monto) FILTER (
            WHERE fecha >= $2 AND fecha < $3
              AND COALESCE(estado_cobro,'pendiente') = 'recibido'
              AND COALESCE(estado_pedido,'entregado') = 'entregado'
          ), 0) AS collections_current,
          COALESCE(SUM(monto) FILTER (
            WHERE fecha >= $1 AND fecha < $2
              AND COALESCE(estado_cobro,'pendiente') = 'recibido'
              AND COALESCE(estado_pedido,'entregado') = 'entregado'
          ), 0) AS collections_previous,
          COALESCE(SUM(monto) FILTER (
            WHERE COALESCE(estado_cobro,'pendiente') IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')
              AND COALESCE(estado_pedido,'entregado') = 'entregado'
          ), 0) AS open_sales_total
        FROM ventas
        WHERE empresa_id = $4
      ),
      costs AS (
        SELECT
          COALESCE(SUM(dv.cantidad * p.costo) FILTER (
            WHERE v.fecha >= $2 AND v.fecha < $3 AND COALESCE(v.estado_pedido,'entregado') = 'entregado'
          ), 0) AS gross_cost_current,
          COALESCE(SUM(dv.cantidad * p.costo) FILTER (
            WHERE v.fecha >= $1 AND v.fecha < $2 AND COALESCE(v.estado_pedido,'entregado') = 'entregado'
          ), 0) AS gross_cost_previous
        FROM detalle_ventas dv
        JOIN ventas v ON v.id = dv.id_venta AND v.empresa_id = dv.empresa_id
        JOIN productos p ON p.id = dv.id_producto AND p.empresa_id = dv.empresa_id
        WHERE dv.empresa_id = $4
      ),
      stock AS (
        SELECT COALESCE(SUM(stock * costo), 0) AS stock_value,
               COALESCE(SUM(stock), 0) AS stock_units,
               COUNT(*) AS stock_products
        FROM productos
        WHERE empresa_id = $4 AND stock > 0
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
        SELECT COALESCE(SUM(total) FILTER (WHERE fecha >= $2 AND fecha < $3), 0) AS purchases_current,
               COALESCE(SUM(GREATEST(total - COALESCE(monto_pagado, 0), 0)) FILTER (
                 WHERE COALESCE(pagado,0) = 0 AND estado <> 'cancelada'
               ), 0) AS open_purchases_total
        FROM compras_registro
        WHERE empresa_id = $4
      )
      SELECT sales_current::text, sales_previous::text,
             collections_current::text, collections_previous::text,
             gross_cost_current::text, gross_cost_previous::text,
             stock_value::text, stock_units::text, stock_products::text,
             (operating_costs_current + salaries_current)::text AS operating_costs_current,
             purchases_current::text,
             open_sales_total::text, open_purchases_total::text
      FROM sales, costs, stock, operating, salaries, purchases
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
    id: number;
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
      SELECT cr.id,
             COALESCE(p.nombre, 'Compra #' || cr.id::text) AS provider,
             COALESCE(cr.descripcion, 'Compra pendiente') AS concept,
             cr.total::text AS total,
             COALESCE(cr.monto_pagado, 0)::text AS paid,
             GREATEST(cr.total - COALESCE(cr.monto_pagado, 0), 0)::text AS balance,
             cr.fecha::text AS date,
             cr.estado AS status
      FROM compras_registro cr
      LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
      WHERE cr.empresa_id = $1
        AND COALESCE(cr.pagado, 0) = 0
        AND cr.estado = 'recibida'
        AND GREATEST(cr.total - COALESCE(cr.monto_pagado, 0), 0) > 0
      ORDER BY cr.fecha ASC NULLS LAST, cr.id ASC
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
    id: number;
    employee: string;
    monthly: string;
    bonus: string;
    charges: string;
    paid: string;
  }>(
    companyId,
    `
      SELECT c.id,
             COALESCE(u.nombre_completo, u.usuario, 'Empleado #' || c.id_usuario::text) AS employee,
             c.sueldo_mensual::text AS monthly,
             CASE WHEN COALESCE(c.aguinaldo_aplica, TRUE) THEN (c.sueldo_mensual / 12)::text ELSE '0' END AS bonus,
             (c.sueldo_mensual * (COALESCE(c.cargas_pct, 0) / 100))::text AS charges,
             COALESCE(SUM(m.monto) FILTER (
               WHERE m.periodo >= $2 AND m.periodo < $3 AND m.tipo IN ('pago','retiro')
             ), 0)::text AS paid
      FROM admin_sueldos_config c
      LEFT JOIN usuarios u ON u.id = c.id_usuario
      LEFT JOIN admin_sueldo_movimientos m
        ON m.empresa_id = c.empresa_id AND m.id_usuario = c.id_usuario
      WHERE c.empresa_id = $1 AND c.activo = TRUE
      GROUP BY c.id, c.id_usuario, u.nombre_completo, u.usuario, c.sueldo_mensual,
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
    id: number;
    label: string;
    amount: string;
    date: string | null;
    kind: string;
  }>(
    companyId,
    `
      SELECT id,
             nombre_cliente AS label,
             monto::text AS amount,
             COALESCE(vencimiento_cobro::date, fecha)::text AS date,
             'inflow' AS kind
      FROM ventas
      WHERE empresa_id = $1
        AND COALESCE(estado_cobro,'pendiente') IN ('pendiente','vencido','en_proceso','pendiente_aprobacion')
        AND COALESCE(estado_pedido,'entregado') = 'entregado'
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
      SELECT cr.id,
             COALESCE(p.nombre, 'Compra #' || cr.id::text) AS label,
             GREATEST(cr.total - COALESCE(cr.monto_pagado, 0), 0)::text AS amount,
             cr.fecha::text AS date,
             'outflow' AS kind
      FROM compras_registro cr
      LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
      WHERE cr.empresa_id = $1
        AND COALESCE(cr.pagado,0) = 0
        AND cr.estado <> 'cancelada'
        AND GREATEST(cr.total - COALESCE(cr.monto_pagado, 0), 0) > 0
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
             COALESCE(u.nombre_completo, u.usuario, 'Empleado #' || c.id_usuario::text) AS label,
             (
               c.sueldo_mensual
               + CASE WHEN COALESCE(c.aguinaldo_aplica, TRUE) THEN c.sueldo_mensual / 12 ELSE 0 END
               + c.sueldo_mensual * (COALESCE(c.cargas_pct, 0) / 100)
             )::text AS amount,
             (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date::text AS date,
             'outflow' AS kind
      FROM admin_sueldos_config c
      LEFT JOIN usuarios u ON u.id = c.id_usuario
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
