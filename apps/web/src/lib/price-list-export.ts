// Pure helpers for the configurable price-list PDF export. No DB or "@/"
// imports so it can be unit-tested with `node --test`.

export type PriceListStock = "con" | "todos";
export type PriceListGroupBy = "categoria" | "proveedor";

export function normalizeStock(value: string | null | undefined): PriceListStock {
  return value === "con" ? "con" : "todos";
}

export function normalizeGroupBy(value: string | null | undefined): PriceListGroupBy {
  return value === "proveedor" ? "proveedor" : "categoria";
}

export function netPriceLegend(): string {
  return "Precios netos expresados en pesos argentinos (ARS), sin IVA. Válidos hasta nuevo aviso o modificación de lista. Sujetos a disponibilidad de stock.";
}
