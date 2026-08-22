import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Cargar Pedido ofrece venta, devolucion y agregado", () => {
  const page = read("src/app/orders/new/page.tsx");
  assert.match(page, /Pedido \/ venta/);
  assert.match(page, /Nota de credito \/ devolucion/);
  assert.match(page, /Nota de debito \/ agregado/);
  assert.match(page, /listSalesAdjustmentReferences/);
});

test("las notas exigen una venta entregada y ajustan stock y cuenta corriente", () => {
  const source = read("src/lib/sales-documents.ts");
  assert.match(source, /estado_pedido !== "entregado"/);
  assert.match(source, /La devolucion solo puede incluir productos de la venta vinculada/);
  assert.match(source, /supera las \$\{available\} unidades pendientes/);
  assert.match(source, /"ajuste_positivo" : "ajuste_negativo"/);
  assert.match(source, /INSERT INTO current_account_movements/);
  assert.match(source, /vatAmountsFromNet/);
});

test("ventas y metricas usan el importe ajustado y muestran comprobantes asociados", () => {
  const salesPage = read("src/app/sales/page.tsx");
  const salesVat = read("src/lib/sales-vat.ts");
  const metrics = read("src/lib/admin-metrics.ts");
  assert.match(salesPage, /sale\.adjustedAmount/);
  assert.match(salesPage, /Comprobantes asociados/);
  assert.match(salesPage, /sale\.associatedDocuments/);
  assert.match(salesVat, /adjustedSalesAmountSql/);
  assert.match(metrics, /adjustedSalesAmountSql/);
});

test("el comprobante habitual del cliente es sugerencia y no bloquea solicitar factura", () => {
  const fields = read("src/app/orders/new/order-entry-fields.tsx");
  const ordersPage = read("src/app/orders/page.tsx");
  const fiscal = read("src/lib/fiscal.ts");
  assert.match(fields, /Comprobante de este pedido/);
  assert.match(fields, /El habitual es solo una sugerencia/);
  assert.doesNotMatch(ordersPage, /usesFiscalInvoice/);
  assert.match(fiscal, /invoiceSaleOrderDocument\(sale\.customerFiscalCondition\)/);
});
