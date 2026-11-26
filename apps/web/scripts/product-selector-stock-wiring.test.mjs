import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const selectors = [
  ["stock", "../src/app/stock/stock-product-workspace.tsx", "product.stock"],
  ["pedidos", "../src/app/orders/new/order-entry-fields.tsx", "product.available"],
  ["ajustes", "../src/app/orders/new/sales-adjustment-fields.tsx", "product.available"],
  ["presupuestos", "../src/app/quotes/quote-entry-fields.tsx", "product.available"],
  ["ofertas", "../src/app/prices/offers/offer-form.tsx", "product.available"],
  ["ofertas de confirmacion", "../src/app/pricing/offers/page.tsx", "product.available"],
];

for (const [name, path, stockExpression] of selectors) {
  test(`${name} informa la disponibilidad al selector compartido`, () => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, new RegExp(`availableStock:\\s*${stockExpression.replace(".", "\\.")}`));
  });
}

test("compras conserva su orden actual para facilitar la reposicion", () => {
  const source = readFileSync(new URL("../src/app/purchases/purchase-entry-fields.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /availableStock\s*:/);
});
