import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/customer-accounts.ts", import.meta.url), "utf8");

test("listOpenCustomerAccounts arma el vencimiento y reusa el filtro de movimientos activos", () => {
  assert.match(source, /activeAccountMovementWhereSql/);
  assert.match(source, /source_payment_term_days/);
  assert.match(source, /computeAgingBuckets/);
  // filtra saldos distintos de cero con epsilon
  assert.match(source, /ABS\([^)]*\)\s*>\s*0\.005/);
});

test("getCustomerStatement trae todos los movimientos ordenados y delega el corte por fecha", () => {
  assert.match(source, /export async function getCustomerStatement/);
  assert.match(source, /ORDER BY m\.movement_date ASC/);
  assert.match(source, /buildCustomerStatement\(/);
  // NO filtra por fecha en SQL (el opening necesita lo anterior a `from`)
  assert.doesNotMatch(source, /movement_date >= \$/);
});
