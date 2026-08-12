import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailSource = readFileSync(new URL("../src/lib/customer-detail.ts", import.meta.url), "utf8");

test("getCustomerPurchaseHistory consulta sales scopeado y usa summarizePurchases", () => {
  assert.match(detailSource, /FROM sales/);
  assert.match(detailSource, /client_id = \$2::uuid/);
  assert.match(detailSource, /summarizePurchases\(/);
});

const listSource = readFileSync(new URL("../src/app/customers/page.tsx", import.meta.url), "utf8");

test("la lista de clientes linkea al detalle y no usa acciones inline", () => {
  assert.match(listSource, /\/customers\/\$\{customer\.id\}/);
  assert.doesNotMatch(listSource, /CustomerRowActions/);
});

const actionsComp = readFileSync(new URL("../src/app/customers/customer-row-actions.tsx", import.meta.url), "utf8");

test("el form de edición incluye el selector de vendedor a cargo", () => {
  assert.match(actionsComp, /name="assignedSeller"/);
  assert.match(actionsComp, /name="seller"/);
});
