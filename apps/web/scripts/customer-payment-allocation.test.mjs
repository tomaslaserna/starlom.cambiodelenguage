import assert from "node:assert/strict";
import test from "node:test";
import { distributeCustomerPayment } from "../src/lib/customer-payment-allocation.ts";

test("distribuye un cobro mayor a la deuda y deja el excedente sin imputar", () => {
  const result = distributeCustomerPayment(
    [{ saleId: "remito-153", outstanding: 24_798.22 }],
    30_000,
  );

  assert.deepEqual(result, { "remito-153": "24798.22" });
});

test("distribuye por orden y aplica parcialmente el ultimo remito", () => {
  const result = distributeCustomerPayment(
    [
      { saleId: "remito-1", outstanding: 10_000 },
      { saleId: "remito-2", outstanding: 20_000 },
      { saleId: "remito-3", outstanding: 30_000 },
    ],
    35_500.75,
  );

  assert.deepEqual(result, {
    "remito-1": "10000.00",
    "remito-2": "20000.00",
    "remito-3": "5500.75",
  });
});

test("no genera imputaciones para importes vacios o invalidos", () => {
  assert.deepEqual(distributeCustomerPayment([{ saleId: "remito-1", outstanding: 100 }], Number.NaN), {});
  assert.deepEqual(distributeCustomerPayment([{ saleId: "remito-1", outstanding: 100 }], -20), {});
});
