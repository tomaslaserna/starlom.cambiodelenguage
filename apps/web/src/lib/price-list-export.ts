// Pure helpers for the configurable price-list PDF export. No DB or "@/"
// imports so it can be unit-tested with `node --test`.

export type PriceListVat = 21 | 10.5;
export type PriceListStock = "con" | "todos";
export type PriceListGroupBy = "categoria" | "proveedor";

// Los precios de lista son netos; el export les suma el IVA elegido.
export function applyVat(net: number, rate: number): number {
  const value = (Number(net) || 0) * (1 + rate / 100);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeVat(value: string | null | undefined): PriceListVat {
  return String(value) === "10.5" ? 10.5 : 21;
}

export function normalizeStock(value: string | null | undefined): PriceListStock {
  return value === "con" ? "con" : "todos";
}

export function normalizeGroupBy(value: string | null | undefined): PriceListGroupBy {
  return value === "proveedor" ? "proveedor" : "categoria";
}

export function vatLegend(rate: PriceListVat): string {
  const base = "Precios expresados en pesos argentinos (ARS)";
  const iva = rate === 10.5 ? "IVA 10,5% incluido" : "IVA 21% incluido";
  return `${base}, ${iva}. Válidos hasta nuevo aviso o modificación de lista. Sujetos a disponibilidad de stock.`;
}
