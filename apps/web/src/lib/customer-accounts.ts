import { ApiError } from "@/lib/api-response";

export type AgingDebit = { amount: number; date: string; dueDate: string | null };
export type AgingBuckets = { current: number; d30: number; d60: number; d90: number; overdueTotal: number };
export type StatementMovement = { id: string; date: string; description: string; debit: number; credit: number; kind: string };
export type StatementLine = StatementMovement & { balance: number };
export type CustomerStatement = { openingBalance: number; lines: StatementLine[]; finalBalance: number };

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function computeAgingBuckets(debits: AgingDebit[], creditTotal: number, asOf: string): AgingBuckets {
  const buckets: AgingBuckets = { current: 0, d30: 0, d60: 0, d90: 0, overdueTotal: 0 };
  let remainingCredit = Math.max(0, money(creditTotal));
  const ordered = [...debits].sort((a, b) => a.date.localeCompare(b.date));

  for (const debit of ordered) {
    let outstanding = money(debit.amount);
    if (remainingCredit > 0) {
      const applied = Math.min(outstanding, remainingCredit);
      outstanding = money(outstanding - applied);
      remainingCredit = money(remainingCredit - applied);
    }
    if (outstanding <= 0.005) continue;

    const overdueDays = daysBetween(debit.dueDate ?? debit.date, asOf);
    if (overdueDays <= 0) {
      buckets.current = money(buckets.current + outstanding);
    } else {
      if (overdueDays <= 30) buckets.d30 = money(buckets.d30 + outstanding);
      else if (overdueDays <= 60) buckets.d60 = money(buckets.d60 + outstanding);
      else buckets.d90 = money(buckets.d90 + outstanding);
      buckets.overdueTotal = money(buckets.overdueTotal + outstanding);
    }
  }
  return buckets;
}

export function buildCustomerStatement(
  movements: StatementMovement[],
  options: { from?: string | null; to?: string | null },
): CustomerStatement {
  const from = options.from?.trim() || null;
  const to = options.to?.trim() || null;

  let openingBalance = 0;
  const lines: StatementLine[] = [];

  for (const movement of movements) {
    const delta = money(movement.debit - movement.credit);
    if (from && movement.date < from) {
      openingBalance = money(openingBalance + delta);
      continue;
    }
    if (to && movement.date > to) continue;
    const previous = lines.length ? lines[lines.length - 1].balance : openingBalance;
    lines.push({ ...movement, balance: money(previous + delta) });
  }

  const finalBalance = lines.length ? lines[lines.length - 1].balance : openingBalance;
  return { openingBalance, lines, finalBalance };
}
