import type { CustomerStatement } from "./customer-accounts";
import { statementSinceLastZero, statementCategory } from "./customer-statement-presentation";

export type PortalHistoryScope = {
  lastZeroDate: string | null;
  closedSaleIds: string[];
  currentSaleIds: string[];
  closedPaymentKeys: string[];
  currentPaymentKeys: string[];
};

/** Use ledger positions (including collapsed allocations), never a day-only cutoff. */
export function portalHistoryScope(statement: CustomerStatement): PortalHistoryScope {
  const current = statementSinceLastZero(statement);
  const closed = statement.lines.slice(0, current.hiddenCount);
  const saleIds = (lines: CustomerStatement["lines"]) => lines.filter((line) => statementCategory(line) === "remito" && line.saleId).map((line) => line.saleId!);
  const paymentKeys = (lines: CustomerStatement["lines"]) => lines.filter((line) => (line.id.startsWith("payment:") && line.id.endsWith(":credit")) || statementCategory(line) === "pago").map((line) => line.id);
  return { lastZeroDate: current.lastZeroDate, closedSaleIds: saleIds(closed), currentSaleIds: saleIds(current.statement.lines), closedPaymentKeys: paymentKeys(closed), currentPaymentKeys: paymentKeys(current.statement.lines) };
}

export function portalCurrentOrders<T extends { id: string; date: string; status: string }>(rows: T[], scope: PortalHistoryScope): T[] {
  if (!scope.lastZeroDate) return rows;
  const closed = new Set(scope.closedSaleIds), current = new Set(scope.currentSaleIds);
  return rows.filter((row) => {
    // Unfulfilled orders are operational work, not closed account history.
    if (!["entregado", "cancelado", "anulado"].includes(row.status) || current.has(row.id)) return true;
    if (closed.has(row.id)) return false;
    // Legacy orders without a ledger entry: preserve ambiguous same-day records.
    return row.date >= scope.lastZeroDate!;
  });
}

export function portalCurrentPayments<T extends { id: string; payment_id?: string; date: string }>(rows: T[], scope: PortalHistoryScope): T[] {
  if (!scope.lastZeroDate) return rows;
  const closed = new Set(scope.closedPaymentKeys), current = new Set(scope.currentPaymentKeys);
  return rows.filter((row) => {
    const key = row.payment_id ? `payment:${row.payment_id}:${row.date}:credit` : row.id;
    if (current.has(key)) return true;
    if (closed.has(key)) return false;
    return row.date >= scope.lastZeroDate!;
  });
}
