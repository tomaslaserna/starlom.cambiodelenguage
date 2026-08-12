import { customerMetrics } from "@/lib/customer-rhythm";

export type PurchaseSummary = {
  totalAmount: number;
  count: number;
  lastPurchase: string | null;
  averageDays: number;
  expectedNext: string | null;
};

const DAY_MS = 86_400_000;

function isoToMs(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function summarizePurchases(purchases: { date: string | null; amount: number }[]): PurchaseSummary {
  const count = purchases.length;
  const totalAmount = purchases.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0);

  const timestamps = purchases
    .map((p) => p.date)
    .filter((date): date is string => Boolean(date))
    .map(isoToMs)
    .sort((a, b) => a - b);

  if (timestamps.length === 0) {
    return { totalAmount, count, lastPurchase: null, averageDays: 0, expectedNext: null };
  }

  const lastMs = timestamps[timestamps.length - 1]!;
  const lastPurchase = msToIso(lastMs);

  if (timestamps.length < 2) {
    return { totalAmount, count, lastPurchase, averageDays: 0, expectedNext: null };
  }

  const { average } = customerMetrics(timestamps);
  return {
    totalAmount,
    count,
    lastPurchase,
    averageDays: average,
    expectedNext: msToIso(lastMs + average * DAY_MS),
  };
}
