import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  Function("require", "module", "exports", compiled)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const vat = loadTypeScriptModule("../src/lib/vat-calculation.ts");

test("net prices produce final totals for both supported VAT rates", () => {
  assert.deepEqual(vat.vatAmountsFromNet(1000, 10.5), { net: 1000, vat: 105, total: 1105 });
  assert.deepEqual(vat.vatAmountsFromNet(1000, 21), { net: 1000, vat: 210, total: 1210 });
  assert.deepEqual(vat.vatAmountsFromGross(1105, 10.5), { net: 1000, vat: 105, total: 1105 });
  assert.deepEqual(vat.vatAmountsFromGross(1210, 21), { net: 1000, vat: 210, total: 1210 });
  assert.equal(vat.arcaVatRateId(10.5), 4);
  assert.equal(vat.arcaVatRateId(21), 5);
});

test("valued remittance lines reconcile discounts and aggregate VAT cents", () => {
  const lines = vat.valuedDocumentLines([
    { quantity: 2, unitPrice: 100, discountPercent: 10, netAmount: 180 },
    { quantity: 1, unitPrice: 100, netAmount: 100 },
  ], 10.5);

  assert.deepEqual(lines[0], {
    quantity: 2,
    netUnitPrice: 90,
    vatRate: 10.5,
    vatUnitAmount: 9.45,
    finalUnitPrice: 99.45,
    net: 180,
    vat: 18.9,
    total: 198.9,
  });
  assert.deepEqual(vat.valuedDocumentSummary(lines), { net: 280, vat: 29.4, total: 309.4 });

  const cents = vat.valuedDocumentLines(
    Array.from({ length: 3 }, () => ({ quantity: 1, unitPrice: 0.01, netAmount: 0.01 })),
    21,
  );
  assert.deepEqual(cents.map((line) => line.vat), [0, 0, 0.01]);
  assert.deepEqual(vat.valuedDocumentSummary(cents), { net: 0.03, vat: 0.01, total: 0.04 });
});

test("valued remittances require a stored rate coherent with their persisted document", () => {
  assert.equal(vat.requireValuedRemittanceVatRate(10.5, { desiredDocument: "remito", receiptType: 0 }), 10.5);
  assert.equal(vat.requireValuedRemittanceVatRate(21, { desiredDocument: "factura_a", receiptType: 1 }), 21);
  assert.equal(vat.requireValuedRemittanceVatRate(21, { desiredDocument: "factura_b", fiscalReceiptType: 6 }), 21);
  assert.throws(
    () => vat.requireValuedRemittanceVatRate(0, { desiredDocument: "remito", receiptType: 0 }),
    /no tiene una alicuota IVA persistida/,
  );
  assert.throws(
    () => vat.requireValuedRemittanceVatRate(10.5, { desiredDocument: "factura_a", receiptType: 1 }),
    /no coincide con el comprobante/,
  );
  assert.throws(
    () => vat.requireValuedRemittanceVatRate(21, { desiredDocument: "remito", receiptType: 1 }),
    /tienen alicuotas incompatibles/,
  );
});

test("stored final totals must match net items plus VAT", () => {
  assert.equal(vat.isFinalTotalConsistent(1105, 1000, 10.5), true);
  assert.equal(vat.isFinalTotalConsistent(1210, 1000, 21), true);
  assert.equal(vat.isFinalTotalConsistent(1000, 1000, 10.5), false);
});
