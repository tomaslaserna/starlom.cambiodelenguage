import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/customers/actions.ts", import.meta.url),
  "utf8",
);

test("updateCustomerAction conserva el vendedor a cargo (assignedSeller) al editar", () => {
  // Sin esto, editar un cliente borra clients.assigned_seller y rompe el CRM.
  assert.match(actionsSource, /assignedSeller: current\.assignedSeller/);
});
