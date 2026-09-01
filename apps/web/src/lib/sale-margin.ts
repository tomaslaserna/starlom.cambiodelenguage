export const LOW_MARGIN_PERCENT = 32;
export const CRITICAL_MARGIN_PERCENT = 25;

export type MarginRisk = "none" | "low" | "critical";

export function grossMarginPercent(revenue: number, cost: number) {
  if (!Number.isFinite(revenue) || revenue <= 0) return cost > 0 ? -100 : 0;
  return ((revenue - cost) / revenue) * 100;
}

export function marginRisk(marginPercent: number): MarginRisk {
  if (marginPercent < CRITICAL_MARGIN_PERCENT) return "critical";
  if (marginPercent < LOW_MARGIN_PERCENT) return "low";
  return "none";
}
