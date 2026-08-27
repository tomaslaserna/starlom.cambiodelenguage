import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCustomerProductPatterns } from "../src/lib/supervisor-lab/product-pattern.ts";

test("resume frecuencia y promedio entre alias sin depender de un solo remito", () => {
  const patterns = summarizeCustomerProductPatterns([
    {
      customerId: "costa",
      customerName: "COSTA WARCALDE",
      seller: "LUCAS",
      purchases: [
        { saleId: "s1", saleNumber: "P-1", date: "2026-05-01", total: 0, items: [
          { productId: "serv-33", name: "SERVILLETA 33X33", quantity: 4, unitPrice: 0 },
        ] },
      ],
    },
    {
      customerId: "pinar",
      customerName: "PINAR EVENTOS",
      seller: "LUCAS",
      purchases: [
        { saleId: "s2", saleNumber: "P-2", date: "2026-06-01", total: 0, items: [
          { productId: "serv-33", name: "SERVILLETA 33X33", quantity: 6, unitPrice: 0 },
          { productId: "film", name: "FILM PVC", quantity: 1, unitPrice: 0 },
        ] },
        { saleId: "s3", saleNumber: "P-3", date: "2026-07-01", total: 0, items: [
          { productId: "serv-33", name: "SERVILLETA 33X33", quantity: 5, unitPrice: 0 },
        ] },
      ],
    },
  ]);

  assert.deepEqual(patterns[0], {
    productId: "serv-33",
    name: "SERVILLETA 33X33",
    purchaseCount: 3,
    totalQuantity: 15,
    averageQuantity: 5,
    lastPurchase: "2026-07-01",
    customers: ["COSTA WARCALDE", "PINAR EVENTOS"],
  });
  assert.equal(patterns[1].name, "FILM PVC");
  assert.equal(patterns[1].purchaseCount, 1);
});
