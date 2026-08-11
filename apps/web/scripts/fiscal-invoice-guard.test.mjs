import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fiscalSource = readFileSync(new URL("../src/lib/fiscal.ts", import.meta.url), "utf8");

test("authorizeSaleFiscalDocument no usa la comparación rota desiredDocument !== 'factura'", () => {
  // El guard comparaba contra el literal "factura", pero los documentos reales
  // son factura_a/factura_b/factura_c → bloqueaba toda factura A/B/C entregada.
  // La validación correcta (invoiceReceiptTypeFromSale) ya cubre el caso.
  assert.doesNotMatch(fiscalSource, /desiredDocument !== "factura"/);
  assert.doesNotMatch(fiscalSource, /La factura fiscal debe solicitarse al aprobar el presupuesto/);
});
