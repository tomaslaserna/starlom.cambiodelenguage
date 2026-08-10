import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ordersSource = readFileSync(new URL("../src/lib/orders.ts", import.meta.url), "utf8");

test("getOrderCustomer: la búsqueda de cliente no filtra por active y reactiva", () => {
  // El lookup del cliente del pedido ya no exige active = true
  assert.doesNotMatch(ordersSource, /id = \$1::uuid AND empresa_id = \$2 AND active = true/);
  // Y se reactiva al cliente al crear el pedido
  assert.match(ordersSource, /reactivateClientIfInactive\(/);
});
