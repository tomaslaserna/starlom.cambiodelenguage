export type PriceListKey = "0" | "1" | "2" | "3" | "4" | "rev";

const PRICE_LIST_DEFAULT: PriceListKey = "1";

export function normalizePriceListKey(value: string | null | undefined): PriceListKey {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const compact = normalized.replace(/[^a-z0-9]+/g, "");

  if (!compact) return PRICE_LIST_DEFAULT;
  if (compact.includes("revendedor") || compact === "rev" || compact === "ver") return "rev";

  const explicit = compact.match(/precio([0-4])/);
  if (explicit) return explicit[1] as PriceListKey;
  if (/^[0-4]$/.test(compact)) return compact as PriceListKey;

  return PRICE_LIST_DEFAULT;
}

export function priceForList(
  prices: Partial<Record<PriceListKey, number>>,
  priceListName: string | null | undefined,
) {
  const key = normalizePriceListKey(priceListName);
  return Number(prices[key] ?? prices[PRICE_LIST_DEFAULT] ?? prices.rev ?? 0);
}

export function money(value: number) {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

export function lineSubtotal(unitPrice: number, quantity: number, discount: number) {
  return money(unitPrice * Math.max(0, quantity) * (1 - Math.min(100, Math.max(0, discount)) / 100));
}
