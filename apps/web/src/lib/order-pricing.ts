export type PriceListKey = "0" | "1" | "2" | "3" | "4" | "rev";
export type PriceListOption = {
  id?: number;
  name: string;
};

export type ProductPriceMap = Record<string, number>;

export const DEFAULT_PRICE_LIST_NAME = "LISTA 1";
const FALLBACK_PRICE_LIST_NAME = "General";

const PRICE_LIST_DEFAULT: PriceListKey = "1";

function priceListToken(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function optionNames(options: PriceListOption[] | string[]) {
  return options.map((option) => (typeof option === "string" ? option : option.name)).filter(Boolean);
}

export function legacyPriceListAlias(value: string | null | undefined) {
  const compact = priceListToken(value);
  if (!compact) return "";
  if (compact.includes("revendedor") || compact === "rev" || compact === "ver") return "MINORISTA";
  if (compact.includes("minorista")) return "MINORISTA";
  if (compact.includes("mayorista")) return "MAYORISTA";
  if (compact.includes("excep") || compact.includes("especial")) return "LISTA EXCEP";
  const explicit = compact.match(/(?:precio|lista)([0-4])/);
  if (explicit) {
    if (explicit[1] === "4") return "MINORISTA";
    return `LISTA ${explicit[1]}`;
  }
  if (/^[0-4]$/.test(compact)) {
    if (compact === "4") return "MINORISTA";
    return `LISTA ${compact}`;
  }
  return String(value ?? "").trim();
}

export function samePriceListName(left: string | null | undefined, right: string | null | undefined) {
  return priceListToken(left) === priceListToken(right);
}

export function resolvePriceListName(
  value: string | null | undefined,
  options: PriceListOption[] | string[] = [],
) {
  const names = optionNames(options);
  const requested = String(value ?? "").trim();
  const alias = legacyPriceListAlias(requested);
  const exact = names.find((name) => samePriceListName(name, requested));
  if (exact) return exact;
  const aliased = names.find((name) => samePriceListName(name, alias));
  if (aliased) return aliased;
  const preferred = names.find((name) => samePriceListName(name, DEFAULT_PRICE_LIST_NAME));
  if (preferred) return preferred;
  const general = names.find((name) => samePriceListName(name, FALLBACK_PRICE_LIST_NAME));
  return general || names[0] || alias || DEFAULT_PRICE_LIST_NAME;
}

export function normalizePriceListKey(value: string | null | undefined): PriceListKey {
  const compact = priceListToken(value);

  if (!compact) return PRICE_LIST_DEFAULT;
  if (compact.includes("revendedor") || compact === "rev" || compact === "ver") return "rev";
  if (compact.includes("minorista")) return "rev";

  const explicit = compact.match(/(?:precio|lista)([0-4])/);
  if (explicit) return explicit[1] as PriceListKey;
  if (/^[0-4]$/.test(compact)) return compact as PriceListKey;

  return PRICE_LIST_DEFAULT;
}

export function priceForList(
  prices: ProductPriceMap,
  priceListName: string | null | undefined,
) {
  const names = Object.keys(prices);
  const resolved = resolvePriceListName(priceListName, names);
  const exact = names.find((name) => samePriceListName(name, resolved));
  if (exact) return Number(prices[exact] ?? 0);

  const legacyKey = normalizePriceListKey(priceListName);
  const legacy = prices[legacyKey] ?? prices[`PRECIO ${legacyKey}`] ?? prices[`LISTA ${legacyKey}`];
  if (legacy !== undefined) return Number(legacy);

  const preferred = names.find((name) => samePriceListName(name, DEFAULT_PRICE_LIST_NAME));
  if (preferred) return Number(prices[preferred] ?? 0);
  const general = names.find((name) => samePriceListName(name, FALLBACK_PRICE_LIST_NAME));
  if (general) return Number(prices[general] ?? 0);
  return Number(Object.values(prices).find((value) => Number(value) > 0) ?? 0);
}

export function money(value: number) {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

export function lineSubtotal(unitPrice: number, quantity: number, discount: number) {
  return money(unitPrice * Math.max(0, quantity) * (1 - Math.min(100, Math.max(0, discount)) / 100));
}
