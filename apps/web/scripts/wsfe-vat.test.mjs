import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loadTypeScriptModule(relativePath, aliases = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const moduleRequire = (specifier) => aliases[specifier] ?? require(specifier);
  Function("require", "module", "exports", compiled)(moduleRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const vatCalculation = loadTypeScriptModule("../src/lib/vat-calculation.ts");
const wsfe = loadTypeScriptModule("../src/lib/arca/wsfe.ts", {
  "@/lib/api-response": { ApiError },
  "@/lib/arca/config": { getArcaConfig: () => ({}) },
  "@/lib/arca/wsaa": { getWsaaTicket: async () => ({ token: "", sign: "" }) },
  "@/lib/arca/xml": {
    escapeXml: String,
    postSoapXml: async () => "",
    soapEnvelope: String,
    tagContent: () => "",
    tagContents: () => [],
  },
  "@/lib/vat-calculation": vatCalculation,
});

test("WSFE decomposes A/B at 21 percent and emits AlicIva Id 5", () => {
  const result = wsfe.invoiceVatXml(6, 1210, 21);
  assert.deepEqual(result.amounts, { net: 1000, vat: 210, total: 1210, vatRate: 21 });
  assert.match(result.xml, /<Id>5<\/Id>/);
  assert.match(result.xml, /<BaseImp>1000\.00<\/BaseImp>/);
  assert.match(result.xml, /<Importe>210\.00<\/Importe>/);
});

test("WSFE blocks A/B with 10.5 or missing VAT and keeps C undiscriminated", () => {
  for (const vatRate of [10.5, 0]) {
    assert.throws(
      () => wsfe.invoiceVatXml(1, vatRate === 10.5 ? 1105 : 1000, vatRate),
      (error) => error instanceof ApiError && error.status === 409 && /requiere la alicuota IVA 21% persistida/.test(error.message),
    );
  }
  assert.deepEqual(wsfe.invoiceVatXml(11, 1000, 0), {
    amounts: { net: 1000, vat: 0, total: 1000, vatRate: 0 },
    xml: "",
  });
});

test("future fiscal snapshots preserve the remote invoice guard fix and historical CAE reads", () => {
  const fiscal = readFileSync(new URL("../src/lib/fiscal.ts", import.meta.url), "utf8");
  const documents = readFileSync(new URL("../src/lib/pdf/documents.ts", import.meta.url), "utf8");
  const ledger = readFileSync(new URL("../src/lib/fiscal-ledger.ts", import.meta.url), "utf8");
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20260812144142_persist_future_sales_vat_rate.sql", import.meta.url),
    "utf8",
  );

  assert.match(fiscal, /fiscal_vat_rate = \$11::numeric/);
  assert.match(fiscal, /assertSaleFinalTotal\(sale\)/);
  assert.match(fiscal, /sale\.fiscalVatRate === null[\s\S]*revision contable manual/);
  assert.match(fiscal, /VAT_DISCRIMINATING_RECEIPT_TYPES\.has\(receiptType\) && vatRate !== 21/);
  assert.doesNotMatch(fiscal, /desiredDocument !== "factura"/);
  assert.doesNotMatch(fiscal, /La factura fiscal debe solicitarse al aprobar el presupuesto/);
  assert.match(documents, /s\.fiscal_vat_rate IS NULL[\s\S]*s\.fiscal_receipt_type IN \(1, 2, 3, 6, 7, 8\) THEN 21/);
  assert.match(documents, /sid\.fiscal_vat_rate IS NULL[\s\S]*sid\.fiscal_receipt_type IN \(1, 2, 3, 6, 7, 8\) THEN 21/);
  assert.match(documents, /assertValuedPdfTotal\(Number\(remito\.monto\), valuedSummary\.net, vatRate\)/);
  assert.match(documents, /assertValuedPdfTotal\(Number\(order\.monto\), valuedSummary\.net, vatRate\)/);
  assert.match(ledger, /COALESCE\(s\.fiscal_vat_rate, 21\)/);
  assert.match(ledger, /COALESCE\(sid\.fiscal_vat_rate, 21\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS fiscal_vat_rate NUMERIC\(5,2\)/);
  assert.doesNotMatch(migration, /UPDATE\s+(?:public\.)?(?:sales|sales_internal_documents)/i);
});
