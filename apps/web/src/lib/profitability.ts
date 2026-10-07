import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { monthRange } from "@/lib/month-range";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import {
  normalizeMonthKey,
  operatingCostAppliesToMonth,
  parseDurationMonths,
  parseOperatingCostKind,
  type OperatingCostKind,
} from "@/lib/operating-cost-schedule";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { netSalesAmountSql } from "@/lib/sales-vat";

export type OperatingCost = {
  id: string;
  concept: string;
  amount: number;
  category: string;
  date: string;
};

export type ScheduledOperatingCost = OperatingCost & {
  costType: OperatingCostKind;
  startMonth: string;
  durationMonths: number | null;
  included: boolean;
  overrideIncluded: boolean | null;
};

export type ScheduledOperatingCostInput = {
  concept: string;
  amount: number;
  costType: OperatingCostKind;
  startMonth: string;
  durationMonths: number | null;
  notes: string;
};

export type OperatingCostInput = {
  concept: string;
  amount: number;
  category: string;
  date: string;
};

export type BreakEvenStatus = {
  month: string;
  fixedCosts: number;
  accumulatedMargin: number;
  grossRevenue: number;
  revenue: number;
  cogs: number;
  missingCostSales: number;
  missingCostRevenue: number;
  costCoveragePercent: number;
  complete: boolean;
  reached: boolean;
  remaining: number;
  profit: number;
};

export async function listOperatingCosts(companyId: number, month: string): Promise<OperatingCost[]> {
  const costs = await listScheduledOperatingCosts(companyId, month);
  return costs.filter((cost) => cost.included).map(({ id, concept, amount, category, date }) => ({ id, concept, amount, category, date }));
}

export async function createOperatingCost(companyId: number, input: OperatingCostInput): Promise<string> {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `INSERT INTO costos_operativos (
       concepto, monto, categoria, fecha, empresa_id,
       cost_type, start_month, duration_months, active
     )
     VALUES ($1, $2, $3, $4::date, $5, 'unico', date_trunc('month', $4::date)::date, 1, true)
     RETURNING id::text AS id`,
    [input.concept, input.amount, input.category, input.date, companyId],
  );
  return result.rows[0].id;
}

export async function deleteOperatingCost(companyId: number, id: string): Promise<void> {
  const result = await queryWithCompanyContext(
    companyId,
    `UPDATE costos_operativos
     SET active = false, updated_at = now()
     WHERE id = $1::bigint AND empresa_id = $2 AND active = true`,
    [id, companyId],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Costo no encontrado");
}

export function operatingCostInputFromBody(body: Record<string, string>): OperatingCostInput {
  const concept = (body.concept ?? "").trim();
  const amount = Number(body.amount);
  const category = (body.category ?? "").trim();
  const date = (body.date ?? "").trim();
  if (!concept) throw new ApiError(400, "El concepto es obligatorio");
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "El monto debe ser mayor a 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "Fecha invalida");
  return { concept, amount, category, date };
}

export function scheduledOperatingCostInputFromBody(body: Record<string, string>): ScheduledOperatingCostInput {
  const concept = (body.concept ?? "").trim();
  const amount = Number(body.amount);
  if (!concept) throw new ApiError(400, "El concepto es obligatorio");
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "El monto debe ser mayor a 0");

  try {
    const costType = parseOperatingCostKind(body.costType ?? body.category ?? "");
    const startMonth = normalizeMonthKey(body.startMonth ?? body.month ?? "");
    const durationMonths = parseDurationMonths(body.durationMonths ?? body.duration ?? "1", costType);
    return { concept, amount, costType, startMonth, durationMonths, notes: (body.notes ?? "").trim() };
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "Costo programado inválido");
  }
}

export async function listScheduledOperatingCosts(companyId: number, month: string): Promise<ScheduledOperatingCost[]> {
  const normalizedMonth = normalizeMonthKey(month);
  const result = await queryWithCompanyContext<{
    id: string;
    concepto: string;
    monto: string;
    categoria: string;
    fecha: string;
    cost_type: OperatingCostKind;
    start_month: string;
    duration_months: number | null;
    override_included: boolean | null;
  }>(
    companyId,
    `SELECT c.id::text AS id,
            c.concepto,
            c.monto::text AS monto,
            c.categoria,
            c.fecha::text AS fecha,
            c.cost_type,
            c.start_month::text AS start_month,
            c.duration_months,
            monthly.included AS override_included
       FROM costos_operativos c
       LEFT JOIN admin_operating_cost_month_status monthly
         ON monthly.empresa_id = c.empresa_id
        AND monthly.cost_id = c.id
        AND monthly.month = $2::date
      WHERE c.empresa_id = $1
        AND c.active = true
        AND c.start_month <= $2::date
        AND (c.duration_months IS NULL OR c.start_month + make_interval(months => c.duration_months) > $2::date)
      ORDER BY c.start_month DESC, c.id DESC`,
    [companyId, `${normalizedMonth}-01`],
  );

  return result.rows.map((row) => ({
    id: row.id,
    concept: row.concepto,
    amount: Number(row.monto),
    category: row.categoria,
    date: row.fecha,
    costType: row.cost_type,
    startMonth: row.start_month.slice(0, 7),
    durationMonths: row.duration_months,
    overrideIncluded: row.override_included,
    included: operatingCostAppliesToMonth({
      startMonth: row.start_month.slice(0, 7),
      durationMonths: row.duration_months,
      overrideIncluded: row.override_included,
    }, normalizedMonth),
  }));
}

export async function createScheduledOperatingCost(companyId: number, input: ScheduledOperatingCostInput) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `INSERT INTO costos_operativos (
       empresa_id, concepto, monto, categoria, fecha,
       cost_type, start_month, duration_months, active, notes
     ) VALUES ($1, $2, $3, $4, $5::date, $4, $5::date, $6, true, $7)
     RETURNING id::text AS id`,
    [companyId, input.concept, input.amount, input.costType, `${input.startMonth}-01`, input.durationMonths, input.notes],
  );
  return { id: result.rows[0].id };
}

export async function updateScheduledOperatingCost(companyId: number, id: string, input: ScheduledOperatingCostInput) {
  const result = await queryWithCompanyContext(
    companyId,
    `UPDATE costos_operativos
        SET concepto = $3,
            monto = $4,
            categoria = $5,
            fecha = $6::date,
            cost_type = $5,
            start_month = $6::date,
            duration_months = $7,
            notes = $8,
            updated_at = now()
      WHERE empresa_id = $1 AND id = $2::bigint AND active = true`,
    [companyId, id, input.concept, input.amount, input.costType, `${input.startMonth}-01`, input.durationMonths, input.notes],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Costo no encontrado");
}

export async function setOperatingCostMonthStatus(input: {
  companyId: number;
  userId: string;
  costId: string;
  month: string;
  included: boolean;
}) {
  const month = `${normalizeMonthKey(input.month)}-01`;
  const result = await queryWithCompanyContext(
    input.companyId,
    `INSERT INTO admin_operating_cost_month_status (
       empresa_id, cost_id, month, included, created_by
     )
     SELECT $1, c.id, $3::date, $4, $5::uuid
       FROM costos_operativos c
      WHERE c.empresa_id = $1 AND c.id = $2::bigint AND c.active = true
     ON CONFLICT (empresa_id, cost_id, month)
     DO UPDATE SET included = EXCLUDED.included, updated_at = now()`,
    [input.companyId, input.costId, month, input.included, input.userId],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Costo no encontrado");
}

export async function getBreakEvenStatus(companyId: number, month: string): Promise<BreakEvenStatus> {
  const { month: normalizedMonth, start, endExclusive } = monthRange(month);

  const costsResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COALESCE(SUM(c.monto), 0)::text AS total
       FROM costos_operativos c
       LEFT JOIN admin_operating_cost_month_status monthly
         ON monthly.empresa_id = c.empresa_id
        AND monthly.cost_id = c.id
        AND monthly.month = $2::date
      WHERE c.empresa_id = $1
        AND c.active = true
        AND c.start_month <= $2::date
        AND (c.duration_months IS NULL OR c.start_month + make_interval(months => c.duration_months) > $2::date)
        AND COALESCE(monthly.included, CASE WHEN c.duration_months IS NULL THEN c.start_month = $2::date ELSE true END)`,
    [companyId, start],
  );
  const fixedCosts = Number(costsResult.rows[0].total);

  const marginResult = await queryWithCompanyContext<{
    gross_revenue: string;
    revenue: string;
    known_revenue: string;
    cogs: string;
    missing_cost_sales: string;
    missing_cost_revenue: string;
  }>(
    companyId,
    `
      WITH profitability_events AS (
        SELECT s.id AS sale_id,
               s.sale_date AS event_date,
               s.total_amount AS gross_amount,
               COALESCE(s.source_net_amount, ${netSalesAmountSql("s.total_amount", "s")}) AS net_amount,
               COALESCE(s.source_cost_amount, line_totals.item_cost, 0) AS cost_amount,
               (s.source_cost_amount IS NOT NULL OR line_totals.item_count > 0) AS cost_known
        FROM sales s
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS item_count,
                 COALESCE(SUM(si.quantity * COALESCE(si.unit_cost_snapshot, p.cost, 0)), 0) AS item_cost
          FROM sale_items si
          LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
          WHERE si.sale_id = s.id AND si.empresa_id = s.empresa_id
        ) line_totals ON true
        WHERE s.empresa_id = $1
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'

        UNION ALL

        SELECT s.id AS sale_id,
               sid.issue_date AS event_date,
               CASE WHEN sid.class_name = 'ND' THEN sid.amount ELSE -sid.amount END AS gross_amount,
               ${netSalesAmountSql("CASE WHEN sid.class_name = 'ND' THEN sid.amount ELSE -sid.amount END", "s")} AS net_amount,
               CASE WHEN sid.class_name = 'ND' THEN note_cost.item_cost ELSE -note_cost.item_cost END AS cost_amount,
               note_cost.item_count > 0 AS cost_known
        FROM sales_internal_documents sid
        JOIN sales s ON s.id = sid.sale_id AND s.empresa_id = sid.empresa_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS item_count,
                 COALESCE(SUM((entry->>'quantity')::numeric * COALESCE(
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
      )
      SELECT COALESCE(SUM(gross_amount), 0)::text AS gross_revenue,
             COALESCE(SUM(net_amount), 0)::text AS revenue,
             COALESCE(SUM(net_amount) FILTER (WHERE cost_known), 0)::text AS known_revenue,
             COALESCE(SUM(cost_amount) FILTER (WHERE cost_known), 0)::text AS cogs,
             COUNT(DISTINCT sale_id) FILTER (WHERE NOT cost_known)::text AS missing_cost_sales,
             COALESCE(SUM(net_amount) FILTER (WHERE NOT cost_known), 0)::text AS missing_cost_revenue
      FROM profitability_events
      WHERE event_date >= $2::date AND event_date < $3::date
    `,
    [companyId, start, endExclusive],
  );
  const grossRevenue = Number(marginResult.rows[0].gross_revenue);
  const revenue = Number(marginResult.rows[0].revenue);
  const knownRevenue = Number(marginResult.rows[0].known_revenue);
  const cogs = Number(marginResult.rows[0].cogs);
  const missingCostSales = Number(marginResult.rows[0].missing_cost_sales);
  const missingCostRevenue = Number(marginResult.rows[0].missing_cost_revenue);
  const accumulatedMargin = knownRevenue - cogs;
  const complete = missingCostSales === 0;

  return {
    month: normalizedMonth,
    fixedCosts,
    accumulatedMargin,
    grossRevenue,
    revenue,
    cogs,
    missingCostSales,
    missingCostRevenue,
    costCoveragePercent: revenue > 0 ? (knownRevenue / revenue) * 100 : 100,
    complete,
    reached: complete && accumulatedMargin >= fixedCosts,
    remaining: Math.max(fixedCosts - accumulatedMargin, 0),
    profit: accumulatedMargin - fixedCosts,
  };
}
