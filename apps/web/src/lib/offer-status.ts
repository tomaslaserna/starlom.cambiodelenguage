// Pure offer helpers: status from validity and the resulting price. No DB or
// "@/" imports (unit-testable). Dates are ISO "YYYY-MM-DD" strings, so
// lexicographic comparison is a valid date comparison.

export type OfferStatus = "inactiva" | "programada" | "vigente" | "vencida";
export type OfferPriceMode = "fijo" | "descuento";

export function computeOfferStatus(
  active: boolean,
  validFrom: string | null,
  validTo: string | null,
  today: string,
): OfferStatus {
  if (!active) return "inactiva";
  if (validFrom && validFrom > today) return "programada";
  if (validTo && validTo < today) return "vencida";
  return "vigente";
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeOfferPrice(
  baseSum: number,
  offer: { priceMode: OfferPriceMode; fixedPrice?: number | null; discountPercent?: number | null; minPrice?: number | null },
): number {
  if (offer.priceMode === "fijo") {
    return round2(Math.max(0, Number(offer.fixedPrice ?? 0)));
  }
  const discounted = (Number(baseSum) || 0) * (1 - Number(offer.discountPercent ?? 0) / 100);
  const floor = Number(offer.minPrice ?? 0);
  return round2(Math.max(floor, discounted));
}
