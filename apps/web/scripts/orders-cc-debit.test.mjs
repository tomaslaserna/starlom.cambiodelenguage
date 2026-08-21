import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/orders.ts", import.meta.url), "utf8");

test("entregar una venta postea el debito en la cuenta corriente", () => {
  // helper existe y se llama al entregar
  assert.match(source, /async function postSaleAccountDebitOnDelivery/);
  assert.match(source, /if \(nextStatus === "entregado"\) \{\s*await postSaleAccountDebitOnDelivery/);
  // inserta un debito ligado a la venta, para el cliente
  assert.match(source, /INSERT INTO current_account_movements/);
  assert.match(source, /VALUES \(\$1::uuid, \$2::uuid, \$3::date, \$4, 0, \$5, 'cliente'/);
  // idempotente: no duplica si ya hay debito para esa venta
  assert.match(source, /FROM current_account_movements WHERE empresa_id = \$1 AND sale_id = \$2::uuid AND debit > 0/);
});
