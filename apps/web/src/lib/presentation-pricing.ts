import {
  lineSubtotal,
  money,
  normalizePriceListKey,
  priceForList,
  type ProductPriceMap,
} from "@/lib/order-pricing";

export type PresentationPriceResult = {
  presentationUnits: number;
  improvedQuantity: number;
  regularQuantity: number;
  improvedUnitPrice: number;
  regularUnitPrice: number;
  effectiveUnitPrice: number;
  subtotal: number;
  unitsToNextPresentation: number | null;
  appliesImprovedPrice: boolean;
};

export function normalizePresentationUnits(value: unknown) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 9999 ? parsed : 1;
}

export function presentationPriceForLine(input: {
  prices: ProductPriceMap;
  priceListName: string | null | undefined;
  presentationUnits: number;
  quantity: number;
  discount?: number;
}): PresentationPriceResult {
  const quantity = Math.max(0, Math.trunc(Number(input.quantity) || 0));
  const presentationUnits = normalizePresentationUnits(input.presentationUnits);
  const regularUnitPrice = money(priceForList(input.prices, input.priceListName));
  const eligible = normalizePriceListKey(input.priceListName) === "2" && presentationUnits > 1;
  const candidateImprovedPrice = eligible ? money(priceForList(input.prices, "L1 - suave")) : regularUnitPrice;
  const improvedUnitPrice = candidateImprovedPrice > 0 ? candidateImprovedPrice : regularUnitPrice;
  const improvedQuantity = eligible ? Math.floor(quantity / presentationUnits) * presentationUnits : 0;
  const regularQuantity = quantity - improvedQuantity;
  const undiscountedSubtotal = money(
    improvedQuantity * improvedUnitPrice + regularQuantity * regularUnitPrice,
  );
  const discount = Math.min(100, Math.max(0, Number(input.discount) || 0));
  const subtotal = lineSubtotal(undiscountedSubtotal, 1, discount);
  const effectiveUnitPrice = quantity > 0 ? money(undiscountedSubtotal / quantity) : regularUnitPrice;
  const remainder = quantity % presentationUnits;
  const unitsToNextPresentation = eligible && quantity > 0 && remainder > 0
    ? presentationUnits - remainder
    : null;

  return {
    presentationUnits,
    improvedQuantity,
    regularQuantity,
    improvedUnitPrice,
    regularUnitPrice,
    effectiveUnitPrice,
    subtotal,
    unitsToNextPresentation,
    appliesImprovedPrice: improvedQuantity > 0 && improvedUnitPrice < regularUnitPrice,
  };
}

export function presentationSuggestion(productName: string, result: PresentationPriceResult) {
  if (!result.unitsToNextPresentation) return null;
  const units = result.unitsToNextPresentation;
  return `Agregando ${units} ${units === 1 ? "unidad" : "unidades"} de ${productName}, completa la presentación de ${result.presentationUnits} y accede al precio L1 para ese bloque.`;
}
