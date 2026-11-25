import {readMonthlyExpenseObligations} from '@/lib/cost-obligations';
import { validCustomerPaymentSql } from "@/lib/treasury-read";
import { queryWithCompanyContext } from "@/lib/db";
import { activeAccountMovementWhereSql } from "@/lib/accounts";
import { fillYearMonths, type MonthlyPoint } from "@/lib/metrics-series";
import { currentMonth, monthRange, shiftMonthKey } from "@/lib/month-range";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { periodBounds, type Period } from "@/lib/period-range";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { netSalesAmountSql } from "@/lib/sales-vat";
import { payrollDuplicateEmployeeSql } from "@/lib/operating-cost-source";
import { monthlyCostAdjustment, monthlyPayrollPayables } from "@/lib/monthly-cost-ledger";

function monthBounds(date = new Date()) {
  const month = currentMonth(date);
  const range = monthRange(month);

  return {
    currentStart: range.start,
    nextStart: range.endExclusive,
    previousStart: monthRange(shiftMonthKey(month, -1)).start,
  };
}

function percentDelta(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

type AdminMetrics = {
  period: ReturnType<typeof monthBounds>;
  sales: {
    current: number;
    previous: number;
    deltaPercent: number | null;
    grossCurrent: number;
    grossPrevious: number;
  };
  collections: { current: number; previous: number; deltaPercent: number | null };
  margin: { grossCost: number; grossProfit: number; operatingCosts: number; scheduledCosts: number; payrollCosts: number; operatingResult: number };
  stock: { value: number; units: number; products: number };
  purchases: { current: number; openTotal: number };
  receivables: { openTotal: number };
};

// Kept as a compatibility hook for existing mutation paths. Administration
// deliberately reads fresh financial data on every request.
export function invalidateAdminMetricsCache(companyId: number) {
  void companyId;
}

export async function getAdminMetrics(companyId: number, period?: Period): Promise<AdminMetrics> {
  const bounds = period ? periodBounds(period) : monthBounds();
  return loadAdminMetrics(companyId, bounds);
}

async function loadAdminMetrics(companyId: number, bounds = monthBounds()): Promise<AdminMetrics> {
  const result = await queryWithCompanyContext<{
    sales_current: string;
    sales_previous: string;
    sales_current_gross: string;
    sales_previous_gross: string;
    collections_current: string;
    collections_previous: string;
    gross_cost_current: string;
    gross_cost_previous: string;
    stock_value: string;
    stock_units: string;
    stock_products: string;
    operating_costs_current: string;
    scheduled_costs_current: string;
    payroll_costs_current: string;
    purchases_current: string;
    open_sales_total: string;
    open_purchases_total: string;
  }>(
    companyId,
    `
      WITH sales_events AS (
        SELECT s.sale_date AS event_date,
               COALESCE(s.source_net_amount, ${netSalesAmountSql("s.total_amount", "s")}) AS net_amount,
               s.total_amount AS gross_amount,
               COALESCE(s.source_cost_amount, line_totals.item_cost, 0) AS cost_amount
        FROM sales s
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost_snapshot, p.cost, 0)), 0) AS item_cost
          FROM sale_items si
          LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
          WHERE si.sale_id = s.id AND si.empresa_id = s.empresa_id
        ) line_totals ON true
        WHERE s.empresa_id = $4
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'

        UNION ALL

        SELECT sid.issue_date AS event_date,
               ${netSalesAmountSql("CASE WHEN sid.class_name = 'ND' THEN sid.amount ELSE -sid.amount END", "s")} AS net_amount,
               CASE WHEN sid.class_name = 'ND' THEN sid.amount ELSE -sid.amount END AS gross_amount,
               CASE WHEN sid.class_name = 'ND' THEN note_cost.item_cost ELSE -note_cost.item_cost END AS cost_amount
        FROM sales_internal_documents sid
        JOIN sales s ON s.id = sid.sale_id AND s.empresa_id = sid.empresa_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM((entry->>'quantity')::numeric * COALESCE(
            NULLIF(entry->>'unitCost', '')::numeric,
            (SELECT MAX(original.unit_cost_snapshot)
               FROM sale_items original
              WHERE original.sale_id = s.id
                AND original.empresa_id = s.empresa_id
                AND original.product_id = NULLIF(entry->>'id', '')::uuid),
            p.cost,
            0
          )), 0) AS item_cost
          FROM jsonb_array_elements(sid.detail_json) entry
          LEFT JOIN products p
            ON p.id = NULLIF(entry->>'id', '')::uuid
           AND p.empresa_id = sid.empresa_id
        ) note_cost ON true
        WHERE sid.empresa_id = $4
          AND (sid.fiscal = false OR sid.operational_document_id IS NULL)
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
      ),
      sales_summary AS (
        SELECT
          COALESCE(SUM(net_amount) FILTER (WHERE event_date >= $2 AND event_date < $3), 0) AS sales_current,
          COALESCE(SUM(net_amount) FILTER (WHERE event_date >= $1 AND event_date < $2), 0) AS sales_previous,
          COALESCE(SUM(gross_amount) FILTER (WHERE event_date >= $2 AND event_date < $3), 0) AS sales_current_gross,
          COALESCE(SUM(gross_amount) FILTER (WHERE event_date >= $1 AND event_date < $2), 0) AS sales_previous_gross,
          COALESCE(SUM(cost_amount) FILTER (WHERE event_date >= $2 AND event_date < $3), 0) AS gross_cost_current,
          COALESCE(SUM(cost_amount) FILTER (WHERE event_date >= $1 AND event_date < $2), 0) AS gross_cost_previous
        FROM sales_events
      ),
      open_sales AS (
        SELECT GREATEST(COALESCE(SUM(cam.debit - cam.credit), 0), 0) AS open_sales_total
        FROM current_account_movements cam
        LEFT JOIN sales account_sale
          ON account_sale.id = cam.sale_id AND account_sale.empresa_id = cam.empresa_id
        WHERE cam.empresa_id = $4
          AND cam.entity_type = 'cliente'
          AND ${activeAccountMovementWhereSql("cam", "account_sale")}
      ),
      payments_summary AS (
        SELECT
          COALESCE(SUM(amount) FILTER (
            WHERE payment_date >= $2 AND payment_date < $3
              AND ${validCustomerPaymentSql('payments')} AND payment_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          ), 0) AS collections_current,
          COALESCE(SUM(amount) FILTER (
            WHERE payment_date >= $1 AND payment_date < $2
              AND ${validCustomerPaymentSql('payments')} AND payment_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          ), 0) AS collections_previous
        FROM payments
        WHERE empresa_id = $4
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
        SELECT COALESCE(SUM(c.monto), 0) AS operating_costs_current
        FROM costos_operativos c
        LEFT JOIN admin_operating_cost_month_status monthly
          ON monthly.empresa_id = c.empresa_id
         AND monthly.cost_id = c.id
         AND monthly.month = $2::date
        WHERE c.empresa_id = $4
          AND c.active = true
          AND ${payrollDuplicateEmployeeSql("c")} IS NULL
          AND c.start_month <= $2::date
          AND (c.duration_months IS NULL OR c.start_month + make_interval(months => c.duration_months) > $2::date)
          AND COALESCE(monthly.included, CASE WHEN c.duration_months IS NULL THEN c.start_month = $2::date ELSE true END)
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
             sales_current_gross::text, sales_previous_gross::text,
             collections_current::text, collections_previous::text,
             gross_cost_current::text, gross_cost_previous::text,
             stock_value::text, stock_units::text, stock_products::text,
             (operating_costs_current + salaries_current)::text AS operating_costs_current,
             operating_costs_current::text AS scheduled_costs_current,
             salaries_current::text AS payroll_costs_current,
             purchases_current::text,
             open_sales_total::text, open_purchases_total::text
      FROM sales_summary, open_sales, payments_summary, stock, operating, salaries, purchases
    `,
    [bounds.previousStart, bounds.currentStart, bounds.nextStart, companyId],
  );

  const row = result.rows[0];
  const salesCurrent = Number(row.sales_current);
  const salesPrevious = Number(row.sales_previous);
  const grossCostCurrent = Number(row.gross_cost_current);
  const costAdjustment = await monthlyCostAdjustment(companyId,bounds.currentStart,bounds.nextStart);
  const operatingCosts = Number(row.operating_costs_current)+costAdjustment.total;

  return {
    period: bounds,
    sales: {
      current: salesCurrent,
      previous: salesPrevious,
      deltaPercent: percentDelta(salesCurrent, salesPrevious),
      grossCurrent: Number(row.sales_current_gross),
      grossPrevious: Number(row.sales_previous_gross),
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
      scheduledCosts: Number(row.scheduled_costs_current ?? 0)+costAdjustment.expenses,
      payrollCosts: Number(row.payroll_costs_current ?? 0)+costAdjustment.salaries,
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

export async function getEarliestSalesMonth(companyId: number): Promise<string> {
  const result = await queryWithCompanyContext<{ month_key: string | null }>(
    companyId,
    `SELECT to_char(MIN(event_date), 'YYYY-MM') AS month_key
       FROM (
         SELECT s.sale_date AS event_date
         FROM sales s
         WHERE s.empresa_id = $1 AND ${canonicalSalesSourceSql("s")}
         UNION ALL
         SELECT sid.issue_date
         FROM sales_internal_documents sid
         JOIN sales s ON s.id = sid.sale_id AND s.empresa_id = sid.empresa_id
         WHERE sid.empresa_id = $1
           AND (sid.fiscal = false OR sid.operational_document_id IS NULL)
           AND ${canonicalSalesSourceSql("s")}
       ) events`,
    [companyId],
  );
  return result.rows[0]?.month_key ?? currentMonth(new Date());
}

export async function getMonthlySeries(companyId: number, year: string): Promise<MonthlyPoint[]> {
  const start = `${year}-01-01`;
  const nextYearStart = `${Number(year) + 1}-01-01`;
  const result = await queryWithCompanyContext<{
    month_key: string;
    facturacion: string;
    ganancia_bruta: string;
  }>(
    companyId,
    `
      WITH ventas AS (
        SELECT to_char(s.sale_date, 'YYYY-MM') AS month_key,
               COALESCE(s.source_net_amount, ${netSalesAmountSql("s.total_amount", "s")}) AS neto,
               COALESCE(s.source_cost_amount, line_totals.item_cost, 0) AS costo
        FROM sales s
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(dv.quantity * COALESCE(dv.unit_cost_snapshot, p.cost, 0)), 0) AS item_cost
          FROM sale_items dv
          LEFT JOIN products p ON p.id = dv.product_id AND p.empresa_id = dv.empresa_id
          WHERE dv.sale_id = s.id AND dv.empresa_id = s.empresa_id
        ) line_totals ON true
        WHERE s.empresa_id = $1
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
          AND s.sale_date >= $2 AND s.sale_date < $3

        UNION ALL

        SELECT to_char(sid.issue_date, 'YYYY-MM') AS month_key,
               ${netSalesAmountSql("CASE WHEN sid.class_name = 'ND' THEN sid.amount ELSE -sid.amount END", "s")} AS neto,
               CASE WHEN sid.class_name = 'ND' THEN note_cost.item_cost ELSE -note_cost.item_cost END AS costo
        FROM sales_internal_documents sid
        JOIN sales s ON s.id = sid.sale_id AND s.empresa_id = sid.empresa_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM((entry->>'quantity')::numeric * COALESCE(
            NULLIF(entry->>'unitCost', '')::numeric,
            (SELECT MAX(original.unit_cost_snapshot)
               FROM sale_items original
              WHERE original.sale_id = s.id
                AND original.empresa_id = s.empresa_id
                AND original.product_id = NULLIF(entry->>'id', '')::uuid),
            p.cost,
            0
          )), 0) AS item_cost
          FROM jsonb_array_elements(sid.detail_json) entry
          LEFT JOIN products p
            ON p.id = NULLIF(entry->>'id', '')::uuid
           AND p.empresa_id = sid.empresa_id
        ) note_cost ON true
        WHERE sid.empresa_id = $1
          AND (sid.fiscal = false OR sid.operational_document_id IS NULL)
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
          AND sid.issue_date >= $2 AND sid.issue_date < $3
      )
      SELECT month_key,
             COALESCE(SUM(neto), 0)::text AS facturacion,
             COALESCE(SUM(neto - costo), 0)::text AS ganancia_bruta
      FROM ventas
      GROUP BY month_key
    `,
    [companyId, start, nextYearStart],
  );
  const byKey = new Map(
    result.rows.map((row) => [
      row.month_key,
      { facturacion: Number(row.facturacion), gananciaBruta: Number(row.ganancia_bruta) },
    ]),
  );
  return fillYearMonths(year, byKey);
}

export type AccumulatedOperatingResult = {
  startMonth: string;
  endMonth: string;
  months: number;
  netSales: number;
  grossCost: number;
  grossProfit: number;
  operatingCosts: number;
  operatingResult: number;
};

export async function getAccumulatedOperatingResult(
  companyId: number,
  throughMonth: string,
): Promise<AccumulatedOperatingResult> {
  const range = monthRange(throughMonth);
  const result = await queryWithCompanyContext<{
    start_month: string;
    months: string;
    net_sales: string;
    gross_cost: string;
    operating_costs: string;
  }>(
    companyId,
    `
      WITH sales_events AS (
        SELECT s.sale_date AS event_date,
               COALESCE(s.source_net_amount, ${netSalesAmountSql("s.total_amount", "s")}) AS net_amount,
               COALESCE(s.source_cost_amount, line_totals.item_cost, 0) AS cost_amount
        FROM sales s
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost_snapshot, p.cost, 0)), 0) AS item_cost
          FROM sale_items si
          LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
          WHERE si.sale_id = s.id AND si.empresa_id = s.empresa_id
        ) line_totals ON true
        WHERE s.empresa_id = $1
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
          AND s.sale_date < $3::date

        UNION ALL

        SELECT sid.issue_date AS event_date,
               ${netSalesAmountSql("CASE WHEN sid.class_name = 'ND' THEN sid.amount ELSE -sid.amount END", "s")} AS net_amount,
               CASE WHEN sid.class_name = 'ND' THEN note_cost.item_cost ELSE -note_cost.item_cost END AS cost_amount
        FROM sales_internal_documents sid
        JOIN sales s ON s.id = sid.sale_id AND s.empresa_id = sid.empresa_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM((entry->>'quantity')::numeric * COALESCE(
            NULLIF(entry->>'unitCost', '')::numeric,
            (SELECT MAX(original.unit_cost_snapshot)
               FROM sale_items original
              WHERE original.sale_id = s.id
                AND original.empresa_id = s.empresa_id
                AND original.product_id = NULLIF(entry->>'id', '')::uuid),
            p.cost,
            0
          )), 0) AS item_cost
          FROM jsonb_array_elements(sid.detail_json) entry
          LEFT JOIN products p
            ON p.id = NULLIF(entry->>'id', '')::uuid
           AND p.empresa_id = sid.empresa_id
        ) note_cost ON true
        WHERE sid.empresa_id = $1
          AND (sid.fiscal = false OR sid.operational_document_id IS NULL)
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
          AND sid.issue_date < $3::date
      ),
      first_period AS (
        SELECT COALESCE(date_trunc('month', MIN(event_date))::date, $2::date) AS start_month
        FROM sales_events
      ),
      months AS (
        SELECT generate_series(first_period.start_month, $2::date, INTERVAL '1 month')::date AS month_start
        FROM first_period
      ),
      sales_by_month AS (
        SELECT date_trunc('month', event_date)::date AS month_start,
               COALESCE(SUM(net_amount), 0) AS net_sales,
               COALESCE(SUM(cost_amount), 0) AS gross_cost
        FROM sales_events
        CROSS JOIN first_period
        WHERE event_date >= first_period.start_month
        GROUP BY date_trunc('month', event_date)::date
      ),
      salaries AS (
        SELECT COALESCE(
          SUM(
            sueldo_mensual
            + CASE WHEN COALESCE(aguinaldo_aplica, TRUE) THEN sueldo_mensual / 12 ELSE 0 END
            + sueldo_mensual * (COALESCE(cargas_pct, 0) / 100)
          ),
          0
        ) AS monthly_total
        FROM admin_sueldos_config
        WHERE empresa_id = $1 AND activo = TRUE
      ),
      costs_by_month AS (
        SELECT m.month_start,
               COALESCE((
                 SELECT SUM(c.monto)
                 FROM costos_operativos c
                 LEFT JOIN admin_operating_cost_month_status monthly
                   ON monthly.empresa_id = c.empresa_id
                  AND monthly.cost_id = c.id
                  AND monthly.month = m.month_start
                 WHERE c.empresa_id = $1
                   AND c.active = TRUE
                   AND ${payrollDuplicateEmployeeSql("c")} IS NULL
                   AND c.start_month <= m.month_start
                   AND (c.duration_months IS NULL OR c.start_month + make_interval(months => c.duration_months) > m.month_start)
                   AND COALESCE(monthly.included, CASE WHEN c.duration_months IS NULL THEN c.start_month = m.month_start ELSE TRUE END)
               ), 0) + salaries.monthly_total AS operating_costs
        FROM months m
        CROSS JOIN salaries
      )
      SELECT to_char(MIN(months.month_start), 'YYYY-MM') AS start_month,
             COUNT(*)::text AS months,
             COALESCE(SUM(sales_by_month.net_sales), 0)::text AS net_sales,
             COALESCE(SUM(sales_by_month.gross_cost), 0)::text AS gross_cost,
             COALESCE(SUM(costs_by_month.operating_costs), 0)::text AS operating_costs
      FROM months
      LEFT JOIN sales_by_month USING (month_start)
      LEFT JOIN costs_by_month USING (month_start)
    `,
    [companyId, range.start, range.endExclusive],
  );

  const row = result.rows[0];
  const netSales = Number(row?.net_sales ?? 0);
  const grossCost = Number(row?.gross_cost ?? 0);
  const costAdjustment = await monthlyCostAdjustment(companyId,`${row?.start_month??throughMonth}-01`,range.endExclusive);
  const operatingCosts = Number(row?.operating_costs ?? 0)+costAdjustment.total;

  return {
    startMonth: row?.start_month ?? throughMonth,
    endMonth: throughMonth,
    months: Number(row?.months ?? 1),
    netSales,
    grossCost,
    grossProfit: netSales - grossCost,
    operatingCosts,
    operatingResult: netSales - grossCost - operatingCosts,
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
    scheduled_amount: string;
    scheduled_date: string | null;
  }>(
    companyId,
    `
      SELECT p.id,
             COALESCE(s.display_name, 'Compra #' || p.id::text) AS provider,
             COALESCE(p.description, 'Compra pendiente') AS concept,
             p.total_amount::text AS total,
             COALESCE(p.paid_amount, 0)::text AS paid,
             GREATEST(p.total_amount - COALESCE(p.paid_amount, 0), 0)::text AS balance,
             COALESCE(p.due_date, p.purchase_date)::text AS date,
             p.status AS status,
             COALESCE(scheduled.scheduled_amount, 0)::text AS scheduled_amount,
             scheduled.scheduled_date
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      LEFT JOIN LATERAL (
 SELECT COALESCE(SUM(amount),0) AS scheduled_amount,MIN(date) AS scheduled_date FROM (
 SELECT COALESCE(NULLIF(req.metadata->>'amount','')::numeric,req.monto,0) AS amount,NULLIF(req.metadata->>'date','') AS date
 FROM app_solicitudes req WHERE req.empresa_id=p.empresa_id AND req.estado='pendiente'
 AND req.metadata->>'action'='supplier_payment' AND req.metadata->>'purchaseId'=p.id::text
 ${process.env.UNIFIED_PAYMENTS_ENABLED === 'true' ? `UNION ALL
 SELECT (o.amount_cents-o.paid_cents)::numeric/100,o.due_date::text FROM admin_supplier_payment_operations o
 WHERE o.empresa_id=p.empresa_id AND o.purchase_id=p.id AND o.intent='schedule' AND o.paid_cents<o.amount_cents` : ''}
 ) plans
 ) scheduled ON true
      WHERE p.empresa_id = $1
        AND p.status = 'recibida'
        AND GREATEST(p.total_amount - COALESCE(p.paid_amount, 0), 0) > 0
      ORDER BY COALESCE(p.due_date, p.purchase_date) ASC NULLS LAST, p.created_at ASC
    `,
    [companyId],
  );

  const issuedCheques = await queryWithCompanyContext<{
    id: string;
    provider: string;
    concept: string;
    balance: string;
    date: string;
    status: string;
  }>(
    companyId,
    `SELECT cheque.id::text, account.name AS provider,
            'Débito E-cheq ' || cheque.cheque_number || ' · ' || cheque.beneficiary AS concept,
            cheque.amount::text AS balance, cheque.due_date::text AS date,
            CASE cheque.status WHEN 'accepted' THEN 'Aceptado' ELSE 'Emitido' END AS status
       FROM admin_outgoing_echeqs cheque
       JOIN admin_treasury_accounts account
         ON account.id = cheque.account_id AND account.empresa_id = cheque.empresa_id
      WHERE cheque.empresa_id = $1 AND cheque.status IN ('issued', 'accepted')`,
    [companyId],
  );

  const monthNow = monthRange(currentMonth());
  const currentStart = monthNow.start;
  const nextStart = monthNow.endExclusive;

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
          OR categoria ILIKE '%cuenta_por_pagar%'
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

  const expenseObligations = await readMonthlyExpenseObligations(companyId);
  const versionedPayroll = await monthlyPayrollPayables(companyId,currentStart.slice(0,7),expenseObligations);
  const data = [
    ...expenseObligations.filter(o=>o.balanceCents>0).map(o=>({id:o.id,provider:o.concept,concept:`Costo de ${o.month}`,total:o.amountCents/100,paid:o.paidCents/100,balance:o.balanceCents/100,date:o.dueDate,status:'pendiente',scheduledAmount:0,scheduledDate:null,source:'costo_mensual'})),
    ...issuedCheques.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      concept: row.concept,
      total: Number(row.balance),
      paid: 0,
      balance: Number(row.balance),
      date: row.date,
      status: row.status,
      scheduledAmount: 0,
      scheduledDate: null,
      source: "echeq",
    })),
    ...purchases.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      concept: row.concept,
      total: Number(row.total),
      paid: Number(row.paid),
      balance: Number(row.balance),
      date: row.date,
      status: row.status,
      scheduledAmount: Number(row.scheduled_amount),
      scheduledDate: row.scheduled_date,
      source: "compra",
    })),
    ...(versionedPayroll ?? salaries.rows.map(row=>({id:row.id,employee:row.employee,total:Number(row.monthly)+Number(row.bonus)+Number(row.charges),paid:Number(row.paid)})))
      .map((row) => {
        const total = row.total;
        const paid = row.paid;
        return {
          id: row.id,
          provider: row.employee,
          concept: versionedPayroll ? "Sueldo base estimado · pendiente de confirmar" : "Sueldo vigente + aguinaldo proporcional + cargas",
          total,
          paid,
          balance: Math.max(0, total - paid),
          date: nextStart,
          status: "sueldo",
          scheduledAmount: 0,
          scheduledDate: null,
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
      scheduledAmount: 0,
      scheduledDate: null,
      source: "impuesto",
    })),
    ...projectedServices.rows.filter(row=>!expenseObligations.some(o=>o.costId===`expense:${row.id}`&&o.month===String(row.date).slice(0,7))).map((row) => ({
      id: row.id,
      provider: row.provider,
      concept: row.concept,
      total: Number(row.balance),
      paid: 0,
      balance: Number(row.balance),
      date: row.date,
      status: row.status,
      scheduledAmount: 0,
      scheduledDate: null,
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

export { getCashflowSnapshot as getCashflow } from "@/lib/cashflow-read";
