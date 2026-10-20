// Bounded live vision requests against synthetic receipts. No DB/storage/payment writes.
// Run with the linked project's development environment, never with customer data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import sharp from "sharp";
import * as ai from "ai";

const require = createRequire(import.meta.url);
function load(path, aliases = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  Function("require", "module", "exports", compiled)((name) => aliases[name] ?? require(name), module, module.exports);
  return module.exports;
}
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const receipt = load("../src/lib/payment-receipt.ts");
const recovery = load("../src/lib/payment-receipt-recovery.ts");
const runs = Number(process.argv.find((arg) => arg.startsWith("--runs="))?.split("=")[1] ?? 1);
if (!Number.isInteger(runs) || runs < 1 || runs > 3) throw new Error("Use --runs=1, 2 or 3");
const simulateTransientFirst = process.argv.includes("--simulate-transient-first");
let sdkCalls = 0;
const route = load("../src/app/api/payments/read-receipt/route.ts", {
  ai: { ...ai, generateText: async (options) => {
    sdkCalls++;
    if (simulateTransientFirst && sdkCalls === 1) throw Object.assign(new Error("Synthetic transient failure"), { statusCode: 503 });
    try { return await ai.generateText(options); }
    catch (error) {
      // Classification only. Never print provider request/response bodies, headers or keys.
      console.log(JSON.stringify({ sdkError: error?.name, status: error?.statusCode, cause: error?.cause?.name }));
      throw error;
    }
  } },
  "@/lib/payment-receipt": receipt,
  "@/lib/payment-receipt-recovery": recovery,
  "@/lib/api-response": { ApiError, ok: (data) => Response.json(data), handleApiError: (error) => Response.json({ error: error instanceof ApiError ? error.message : "Internal test error" }, { status: error.status ?? 500 }) },
  // Only the authenticated SDK call is exercised here; real session gates have unit tests.
  "@/lib/route-auth": { COLLECTIONS_CREATE_PERMISSION: {}, CRM_READ_PERMISSION: {}, requireApiSession: async () => ({ companyId: 1, userId: "synthetic-smoke-test" }) },
});
const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="950" height="600"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" fill="black"><text x="40" y="65" font-size="28">COMPROBANTE DE TRANSFERENCIA - PRUEBA</text><text x="40" y="140" font-size="25">Transferencia realizada - Moneda: ARS</text><text x="40" y="220" font-size="38">Importe: $ 123.456,78</text><text x="40" y="300" font-size="30">Fecha de transferencia: 20/10/2026</text><text x="40" y="380" font-size="30">Numero de operacion: TEST-123456</text><text x="40" y="500" font-size="20">DATOS SINTETICOS - NO REPRESENTA UN PAGO REAL</text></g></svg>`)).png().toBuffer();
for (let run = 1; run <= runs; run++) {
const startedAt = Date.now();
const body = new FormData(); body.set("receipt", new File([image], "synthetic.png", { type: "image/png" }));
const response = await route.POST(new Request("https://starlim.test/api/payments/read-receipt", { method: "POST", body, headers: { origin: "https://starlim.test" } }));
const result = await response.json();
console.log(JSON.stringify({ run, status: response.status, elapsedMs: Date.now() - startedAt, sdkCalls, ...result }));
assert.equal(response.status, 200);
assert.deepEqual(result.data, { amount: 123456.78, date: "2026-10-20", operation: "TEST-123456" });
}
