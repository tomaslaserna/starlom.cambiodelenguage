import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fiscalSource = readFileSync(new URL("../src/lib/fiscal.ts", import.meta.url), "utf8");
const salesPageSource = readFileSync(new URL("../src/app/sales/page.tsx", import.meta.url), "utf8");
const salesActionsSource = readFileSync(new URL("../src/app/sales/actions.ts", import.meta.url), "utf8");
const ordersSource = readFileSync(new URL("../src/lib/orders.ts", import.meta.url), "utf8");

test("authorizeSaleFiscalDocument no usa la comparación rota desiredDocument !== 'factura'", () => {
  // El guard comparaba contra el literal "factura", pero los documentos reales
  // son factura_a/factura_b/factura_c → bloqueaba toda factura A/B/C entregada.
  // La validación correcta (invoiceReceiptTypeFromSale) ya cubre el caso.
  assert.doesNotMatch(fiscalSource, /desiredDocument !== "factura"/);
  assert.doesNotMatch(fiscalSource, /La factura fiscal debe solicitarse al aprobar el presupuesto/);
});

test("entregar un pedido factura A o B emite automaticamente sin solicitud", () => {
  assert.match(ordersSource, /await authorizeSaleFiscalDocument\(session, id\)/);
  assert.match(ordersSource, /result\.desiredDocument === "factura_a"/);
  assert.match(ordersSource, /result\.desiredDocument === "factura_b"/);
  assert.doesNotMatch(salesPageSource, /requestFiscalInvoiceAction|Solicitar factura/);
  assert.doesNotMatch(salesActionsSource, /requestSaleFiscalInvoice/);
  assert.doesNotMatch(fiscalSource, /export async function requestSaleFiscalInvoice/);
});

test("la facturacion usa el CUIT vigente del cliente si la venta guardo un documento vacio", () => {
  assert.doesNotMatch(fiscalSource, /COALESCE\(s\.client_document, c\.tax_id, ''\)/);
  assert.match(fiscalSource, /COALESCE\(NULLIF\(BTRIM\(s\.client_document\), ''\), c\.tax_id, ''\) AS client_document/);
});
