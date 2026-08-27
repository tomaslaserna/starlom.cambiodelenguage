import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fiscalSource = readFileSync(new URL("../src/lib/fiscal.ts", import.meta.url), "utf8");
const salesPageSource = readFileSync(new URL("../src/app/sales/page.tsx", import.meta.url), "utf8");
const salesActionsSource = readFileSync(new URL("../src/app/sales/actions.ts", import.meta.url), "utf8");

test("authorizeSaleFiscalDocument no usa la comparación rota desiredDocument !== 'factura'", () => {
  // El guard comparaba contra el literal "factura", pero los documentos reales
  // son factura_a/factura_b/factura_c → bloqueaba toda factura A/B/C entregada.
  // La validación correcta (invoiceReceiptTypeFromSale) ya cubre el caso.
  assert.doesNotMatch(fiscalSource, /desiredDocument !== "factura"/);
  assert.doesNotMatch(fiscalSource, /La factura fiscal debe solicitarse al aprobar el presupuesto/);
});

test("Registro de ventas permite solicitar una factura elegible", () => {
  assert.match(salesPageSource, /form action=\{requestFiscalInvoiceAction\}/);
  assert.match(salesPageSource, /sale\.hasPendingFiscalRequest/);
  assert.match(salesActionsSource, /requestSaleFiscalInvoice\(session, id\)/);
  assert.match(salesActionsSource, /requireApiSession\(\[SALES_OPERATE_PERMISSION\]\)/);
});
