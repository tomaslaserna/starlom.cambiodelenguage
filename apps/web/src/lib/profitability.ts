import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { monthRange } from "@/lib/month-range";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { netSalesAmountSql } from "@/lib/sales-vat";

export type OperatingCost = {
  id: string;
  concept: string;
  amount: number;
  category: string;
  date: string;
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
  const { start, endExclusive } = monthRange(month);
  const result = await queryWithCompanyContext<{
    id: string;
    concepto: string;
    monto: string;
    categoria: string | null;
    fecha: string;
  }>(
    companyId,
    `SELECT id::text AS id, concepto, monto::text AS monto, categoria, fecha::text AS fecha
     FROM costos_operativos
     WHERE empresa_id = $1 AND fecha >= $2::date AND fecha < $3::date
     ORDER BY fecha DESC, id DESC`,
    [companyId, start, endExclusive],
  );
  return result.rows.map((row) => ({
    id: row.id,
    concept: row.concepto,
    amount: Number(row.monto),
    category: row.categoria ?? "",
    date: row.fecha,
  }));
}

export async function createOperatingCost(companyId: number, input: OperatingCostInput): Promise<string> {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `INSERT INTO costos_operativos (concepto, monto, categoria, fecha, empresa_id)
     VALUES ($1, $2, $3, $4::date, $5)
     RETURNING id::text AS id`,
    [input.concept, input.amount, input.category, input.date, companyId],
  );
  return result.rows[0].id;
}

export async function deleteOperatingCost(companyId: number, id: string): Promise<void> {
  const result = await queryWithCompanyContext(
    companyId,
    `DELETE FROM costos_operativos WHERE id = $1::bigint AND empresa_id = $2`,
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

export async function getBreakEvenStatus(companyId: number, month: string): Promise<BreakEvenStatus> {
  const { month: normalizedMonth, start, endExclusive } = monthRange(month);

  const costsResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COALESCE(SUM(monto), 0)::text AS total
     FROM costos_operativos
     WHERE empresa_id = $1 AND fecha >= $2::date AND fecha < $3::date`,
    [companyId, start, endExclusive],
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
                 COALESCE(SUM(si.quantity * COALESCE(p.cost, 0)), 0) AS item_cost
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
                 COALESCE(SUM((entry->>'quantity')::numeric * COALESCE(p.cost, 0)), 0) AS item_cost
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
