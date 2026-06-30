import type { PriceListKey } from "@/lib/order-pricing";

export function priceSqlExpression(key: PriceListKey) {
  switch (key) {
    case "0":
      return "ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_0, 1), 2)";
    case "2":
      return "ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_2, 1), 2)";
    case "3":
    case "4":
      return "ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_3, 1), 2)";
    case "rev":
      return "ROUND(COALESCE(p.cost, 0) * COALESCE(m.margen_minorista, 1), 2)";
    case "1":
    default:
      return "ROUND(COALESCE(p.cost, 0) * COALESCE(m.precio_1, 1), 2)";
  }
}

export function productMarginCodeExpression(alias = "p") {
  return `CASE
    WHEN NULLIF(REGEXP_REPLACE(UPPER(COALESCE(${alias}.category_code, '')), '[^A-Z0-9]', '', 'g'), '') IS NOT NULL
      THEN LEFT(REGEXP_REPLACE(UPPER(${alias}.category_code), '[^A-Z0-9]', '', 'g'), 10)
    ELSE 'CAT' || UPPER(SUBSTRING(MD5(COALESCE(${alias}.category, 'Sin categoria')) FROM 1 FOR 7))
  END`;
}
