import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { monthRange } from "@/lib/month-range";
import { normalizedOrderStatusSql } from "@/lib/order-status";

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
  revenue: number;
  cogs: number;
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

  const marginResult = await queryWithCompanyContext<{ revenue: string; cogs: string }>(
    companyId,
    `SELECT
       COALESCE(SUM(si.total_amount), 0)::text AS revenue,
       COALESCE(SUM(COALESCE(p.cost, 0) * si.quantity), 0)::text AS cogs
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id AND s.empresa_id = si.empresa_id
     LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
     WHERE si.empresa_id = $1
       AND s.sale_date >= $2::date AND s.sale_date < $3::date
       AND ${normalizedOrderStatusSql("s")} = 'entregado'`,
    [companyId, start, endExclusive],
  );
  const revenue = Number(marginResult.rows[0].revenue);
  const cogs = Number(marginResult.rows[0].cogs);
  const accumulatedMargin = revenue - cogs;

  return {
    month: normalizedMonth,
    fixedCosts,
    accumulatedMargin,
    revenue,
    cogs,
    reached: accumulatedMargin >= fixedCosts,
    remaining: Math.max(fixedCosts - accumulatedMargin, 0),
    profit: accumulatedMargin - fixedCosts,
  };
}
