import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import {
  getAccountsPayable,
  getAccumulatedOperatingResult,
  getAdminMetrics,
} from "@/lib/admin-metrics";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import {
  getBankReconciliationSummary,
  getTreasuryBalances,
} from "@/lib/finance";
import { type Period } from "@/lib/period-range";
import { getBreakEvenStatus, listScheduledOperatingCosts } from "@/lib/profitability";

const READ = { cache: false } as const;

export type AdministrationClosureSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  month: string;
  results: {
    netSales: number;
    grossSales: number;
    grossCost: number;
    grossProfit: number;
    operatingCosts: number;
    operatingResult: number;
    accumulatedOperatingResult: number;
    accumulatedSince: string;
  };
  position: {
    treasury: number;
    receivables: number;
    stock: number;
    payables: number;
    observableEquity: number;
  };
  evidence: {
    salesCostCoveragePercent: number;
    missingCostSales: number;
    bankCoveragePercent: number;
    bankPendingLines: number;
    bankPartialLines: number;
    bankUnmatchedAmount: number;
    suspendedIndefiniteCosts: number;
  };
};

export type AdministrationCloseCheck = {
  key: "sales_costs" | "bank_reconciliation" | "operating_costs";
  label: string;
  ready: boolean;
  detail: string;
};

export type AdministrationClosePreview = {
  ready: boolean;
  checks: AdministrationCloseCheck[];
  snapshot: AdministrationClosureSnapshot;
};

export type AdministrationMonthlyClosure = {
  id: number;
  month: string;
  version: number;
  status: "closed" | "reopened";
  snapshot: AdministrationClosureSnapshot;
  notes: string;
  closedByUsername: string;
  closedAt: string;
  reopenedAt: string | null;
  reopenReason: string;
};

function assertMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(400, "Período inválido");
}

export async function getAdministrationClosePreview(
  companyId: number,
  month: string,
): Promise<AdministrationClosePreview> {
  assertMonth(month);
  const period: Period = { kind: "month", key: month };
  const [metrics, accumulated, payables, treasury, profitability, operatingCosts, reconciliation] = await Promise.all([
    getAdminMetrics(companyId, period),
    getAccumulatedOperatingResult(companyId, month),
    getAccountsPayable(companyId),
    getTreasuryBalances(companyId),
    getBreakEvenStatus(companyId, month),
    listScheduledOperatingCosts(companyId, month),
    getBankReconciliationSummary(companyId, period),
  ]);
  const suspendedIndefiniteCosts = operatingCosts.filter((cost) => cost.durationMonths === null && !cost.included).length;
  const assets = treasury.meta.total + metrics.receivables.openTotal + metrics.stock.value;

  const checks: AdministrationCloseCheck[] = [
    {
      key: "sales_costs",
      label: "Costos de ventas completos",
      ready: profitability.complete,
      detail: profitability.complete
        ? "Todos los remitos tienen costo comprobable"
        : `${profitability.missingCostSales} ventas sin costo`,
    },
    {
      key: "bank_reconciliation",
      label: "Conciliación bancaria completa",
      ready: reconciliation.ready,
      detail: reconciliation.ready
        ? "Extractos sin diferencias pendientes"
        : `${reconciliation.pendingLines + reconciliation.partialLines} movimientos a revisar`,
    },
    {
      key: "operating_costs",
      label: "Costos fijos confirmados",
      ready: suspendedIndefiniteCosts === 0,
      detail: suspendedIndefiniteCosts === 0
        ? "No quedan costos indefinidos suspendidos"
        : `${suspendedIndefiniteCosts} costos requieren decisión`,
    },
  ];

  return {
    ready: checks.every((check) => check.ready),
    checks,
    snapshot: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      month,
      results: {
        netSales: metrics.sales.current,
        grossSales: metrics.sales.grossCurrent,
        grossCost: metrics.margin.grossCost,
        grossProfit: metrics.margin.grossProfit,
        operatingCosts: metrics.margin.operatingCosts,
        operatingResult: metrics.margin.operatingResult,
        accumulatedOperatingResult: accumulated.operatingResult,
        accumulatedSince: accumulated.startMonth,
      },
      position: {
        treasury: treasury.meta.total,
        receivables: metrics.receivables.openTotal,
        stock: metrics.stock.value,
        payables: payables.meta.total,
        observableEquity: assets - payables.meta.total,
      },
      evidence: {
        salesCostCoveragePercent: profitability.costCoveragePercent,
        missingCostSales: profitability.missingCostSales,
        bankCoveragePercent: reconciliation.coveragePercent,
        bankPendingLines: reconciliation.pendingLines,
        bankPartialLines: reconciliation.partialLines,
        bankUnmatchedAmount: reconciliation.unmatchedAmount,
        suspendedIndefiniteCosts,
      },
    },
  };
}

export async function getAdministrationMonthClosure(
  companyId: number,
  month: string,
): Promise<AdministrationMonthlyClosure | null> {
  assertMonth(month);
  const result = await queryWithCompanyContext<{
    id: string;
    month: string;
    version: number;
    status: "closed" | "reopened";
    snapshot: AdministrationClosureSnapshot;
    notes: string;
    closed_by_username: string;
    closed_at: string;
    reopened_at: string | null;
    reopen_reason: string;
  }>(
    companyId,
    `SELECT id::text, month::text, version, status, snapshot, notes,
            closed_by_username, closed_at::text, reopened_at::text, reopen_reason
       FROM admin_finance_monthly_closures
      WHERE empresa_id = $1 AND month = $2::date AND status = 'closed'
      ORDER BY version DESC
      LIMIT 1`,
    [companyId, `${month}-01`],
    READ,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    month: row.month.slice(0, 7),
    version: row.version,
    status: row.status,
    snapshot: row.snapshot,
    notes: row.notes,
    closedByUsername: row.closed_by_username,
    closedAt: row.closed_at,
    reopenedAt: row.reopened_at,
    reopenReason: row.reopen_reason,
  };
}

export async function closeAdministrationMonth(session: AuthSession, month: string, notes: string) {
  const preview = await getAdministrationClosePreview(session.companyId, month);
  if (!preview.ready) {
    const pending = preview.checks.filter((check) => !check.ready).map((check) => check.label).join(", ");
    throw new ApiError(409, `No se puede cerrar el período: ${pending}`);
  }

  return withCompanyContext(session.companyId, async (client) => {
    const existing = await client.query(
      `SELECT id FROM admin_finance_monthly_closures
        WHERE empresa_id = $1 AND month = $2::date AND status = 'closed'
        FOR UPDATE`,
      [session.companyId, `${month}-01`],
    );
    if (existing.rows[0]) throw new ApiError(409, "El período ya está cerrado");

    const versionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM admin_finance_monthly_closures
        WHERE empresa_id = $1 AND month = $2::date`,
      [session.companyId, `${month}-01`],
    );
    const inserted = await client.query<{ id: string; version: number }>(
      `INSERT INTO admin_finance_monthly_closures (
         empresa_id, month, version, snapshot, notes, closed_by, closed_by_username
       ) VALUES ($1, $2::date, $3, $4::jsonb, $5, $6::uuid, $7)
       RETURNING id::text, version`,
      [
        session.companyId,
        `${month}-01`,
        versionResult.rows[0].next_version,
        JSON.stringify(preview.snapshot),
        notes.trim().slice(0, 1000),
        session.userId,
        session.username,
      ],
    );
    return inserted.rows[0];
  });
}

export async function reopenAdministrationMonth(
  session: AuthSession,
  month: string,
  reason: string,
) {
  assertMonth(month);
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 5) throw new ApiError(400, "Indicá el motivo de reapertura");

  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `UPDATE admin_finance_monthly_closures
        SET status = 'reopened', reopened_by = $3::uuid, reopened_at = now(), reopen_reason = $4
      WHERE empresa_id = $1 AND month = $2::date AND status = 'closed'
      RETURNING id::text`,
    [session.companyId, `${month}-01`, session.userId, normalizedReason.slice(0, 1000)],
  );
  if (!result.rows[0]) throw new ApiError(404, "No hay un cierre vigente para reabrir");
  return { id: result.rows[0].id };
}
