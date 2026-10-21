import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

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
const png = () => new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr14AAAAASUVORK5CYII=", "base64")], "prueba.png", { type: "image/png" });
const session = { companyId: 1, userId: "operator-1" };

test("comprobante: límites y firmas reales, no sólo extensión o MIME", async () => {
  assert.equal(receipt.paymentReceiptFileError(png()), null);
  assert.equal((await receipt.paymentReceiptBytes(png())).length, png().size);
  await assert.rejects(() => receipt.paymentReceiptBytes(new File(["<svg>"], "foto.png", { type: "image/png" })), /imagen válida/);
  await assert.rejects(() => receipt.paymentReceiptBytes(new File(["%PDF"], "foto.pdf", { type: "application/pdf" })), /JPG/);
  assert.match(receipt.paymentReceiptFileError({ size: 4 * 1024 * 1024, type: "image/png" }), /3 MB/);
  assert.match(receipt.paymentReceiptFileError({ size: 0, type: "image/png" }), /3 MB/);
  await assert.rejects(() => receipt.paymentReceiptBytes(new File(["RIFF0000NOTWEBP"], "foto.webp", { type: "image/webp" })), /imagen válida/);
});

test("lectura: importes, fechas e identificadores se normalizan sin inventar datos", () => {
  assert.deepEqual(receipt.normalizePaymentReceiptReading({ amount: 130400.123, date: "2026-10-20", operation: "  LR7DHfL581 " }), { amount: 130400.12, date: "2026-10-20", operation: "LR7DHfL581" });
  for (const amount of [null, 0, -1, Infinity, 1e12, "123.456,78"]) assert.equal(receipt.normalizePaymentReceiptReading({ amount, date: null, operation: null }).amount, null);
  for (const date of ["2026-02-30", "20/10/2026", "garbage", null]) assert.equal(receipt.normalizePaymentReceiptReading({ amount: null, date, operation: null }).date, null);
  assert.equal(receipt.normalizePaymentReceiptReading({ amount: null, date: null, operation: "<script>alert(1)</script>" }).operation, null);
});

function formModule(overrides = {}) {
  return load("../src/lib/customer-payment-form.ts", {
    "server-only": {},
    "@/lib/payment-receipt": receipt,
    "@/lib/customer-accounts": { customerPaymentFromBody: (body, evidence) => {
      assert.equal(body.receiptUrl, undefined);
      return { clientId: "client-1", method: "transferencia", operation: "", evidence };
    }, registerCustomerPayment: overrides.register ?? (async () => undefined) },
    "@/lib/storage": {
      uploadImageFile: overrides.upload ?? (async (input) => {
        assert.equal(input.folder, "recibos"); assert.equal(input.namePrefix, "recibo_1_pago");
        assert.match(input.file.name, /^[0-9a-f]{64}\.png$/);
        return { url: "starlim-storage://uploads/recibos/recibo_1_pago_test.png", bucket: "uploads", path: "recibos/recibo_1_pago_test.png" };
      }), removeStorageObjects: overrides.remove ?? (async () => undefined),
    },
    "@/lib/db": { queryWithCompanyContext: overrides.query ?? (async () => ({ rows: [] })) },
  });
}
const form = () => { const data = new FormData(); data.set("receipt", png()); return data; };

test("guardado: conserva adjunto privado, hash y evidencia validada en la vía compartida", async () => {
  let input;
  await formModule({ register: async (_session, value) => { input = value; } }).registerCustomerPaymentFromForm(session, form());
  assert.equal(input.evidence.hasValidatedReceipt, true);
  assert.match(input.receiptUrl, /^starlim-storage:/); assert.match(input.receiptHash, /^[0-9a-f]{64}$/);
});
test("guardado fallido: limpia sólo el archivo recién subido si no quedó vinculado", async () => {
  let removed;
  await assert.rejects(() => formModule({ register: async () => { throw new Error("transacción rechazada"); }, remove: async (...args) => { removed = args; } }).registerCustomerPaymentFromForm(session, form()), /rechazada/);
  assert.deepEqual(removed, ["uploads", ["recibos/recibo_1_pago_test.png"]]);
});
test("respuesta perdida después del commit: no elimina la evidencia persistida", async () => {
  let removed = false;
  await assert.rejects(() => formModule({ register: async () => { throw new Error("respuesta perdida"); }, query: async () => ({ rows: [{ id: "saved" }] }), remove: async () => { removed = true; } }).registerCustomerPaymentFromForm(session, form()), /perdida/);
  assert.equal(removed, false);
});
test("imagen adulterada: rechaza antes de subir archivo o guardar dinero", async () => {
  let writes = 0;
  const data = new FormData(); data.set("receipt", new File(["not an image"], "fake.png", { type: "image/png" }));
  await assert.rejects(() => formModule({ upload: async () => { writes++; }, register: async () => { writes++; } }).registerCustomerPaymentFromForm(session, data), /imagen válida/);
  assert.equal(writes, 0);
});

function readerRoute(overrides = {}) {
  return load("../src/app/api/payments/read-receipt/route.ts", {
    ai: { generateText: overrides.generate ?? (async () => ({ output: { amount: 123456.78, date: "2026-10-20", operation: "OP-123" } })), Output: { object: (value) => value } },
    "@/lib/payment-receipt": receipt,
    "@/lib/payment-receipt-recovery": recovery,
    "@/lib/api-response": { ApiError, ok: (data) => Response.json(data), handleApiError: (error) => Response.json({ error: error.message }, { status: error.status ?? 500 }) },
    "@/lib/route-auth": { COLLECTIONS_CREATE_PERMISSION: {}, CRM_READ_PERMISSION: {}, requireApiSession: overrides.auth ?? (async () => session) },
  });
}
function readingRequest(data = form(), origin = "https://starlim.test") { return new Request("https://starlim.test/api/payments/read-receipt", { method: "POST", body: data, headers: { origin } }); }
async function withConfiguredAi(fn) {
  const before = process.env.AI_GATEWAY_API_KEY; process.env.AI_GATEWAY_API_KEY = "test-not-a-real-key";
  try { await fn(); } finally { if (before === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = before; }
}

test("API lectura: autenticación y origen antes de enviar imágenes a IA", async () => {
  const unauthorized = readerRoute({ auth: async () => { throw new ApiError(401, "Ingresá"); }, generate: async () => { assert.fail("IA no autorizada"); } });
  assert.equal((await unauthorized.POST(readingRequest())).status, 401);
  assert.equal((await readerRoute().POST(readingRequest(form(), "https://evil.test"))).status, 403);
});
test("API lectura: devuelve sugerencias sin guardar pagos ni elegir remitos", () => withConfiguredAi(async () => {
  const response = await readerRoute({ generate: async (args) => {
    assert.equal(args.tools, undefined); assert.equal(args.maxRetries, 0); assert.ok(args.abortSignal);
    assert.equal(args.model, "openai/gpt-5.4-mini");
    assert.equal(args.reasoning, "none"); assert.equal(args.maxOutputTokens, 768);
    assert.match(args.system, /NO confiable/);
    return { output: { amount: 123456.78, date: "2026-10-20", operation: "OP-123" } };
  } }).POST(readingRequest());
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await response.json(), { data: { amount: 123456.78, date: "2026-10-20", operation: "OP-123" } });
}));
test("API lectura: falla de proveedor se traduce a alternativa manual sin filtrar datos", () => withConfiguredAi(async () => {
  const response = await readerRoute({ generate: async () => { throw new Error("secret banking image"); } }).POST(readingRequest());
  assert.equal(response.status, 503); const text = await response.text();
  assert.match(text, /manualmente/); assert.doesNotMatch(text, /secret banking/);
}));

test("API lectura: un fallo transitorio se recupera en el mismo POST, sin intervención del usuario", () => withConfiguredAi(async () => {
  let calls = 0;
  const response = await readerRoute({ generate: async (args) => {
    if (++calls === 1) throw Object.assign(new Error("secret banking image"), { statusCode: 503 });
    assert.equal(args.model, "google/gemini-3.5-flash"); assert.equal(args.reasoning, "low");
    assert.equal(args.maxOutputTokens, 4096);
    return { output: { amount: 123456.78, date: "2026-10-20", operation: "OP-123" } };
  } }).POST(readingRequest());
  assert.equal(response.status, 200); assert.equal(calls, 2);
  assert.deepEqual((await response.json()).data, { amount: 123456.78, date: "2026-10-20", operation: "OP-123" });
}));

for (const name of ["AI_NoOutputGeneratedError", "AI_NoObjectGeneratedError"]) test(`recuperación: ${name} vuelve a leer antes de devolver error`, async () => {
  let calls = 0; const events = [];
  const result = await recovery.readReceiptWithRecovery(async () => {
    if (++calls === 1) throw Object.assign(new Error("private response"), { name });
    return { amount: 10, date: null, operation: null };
  }, { signal: new AbortController().signal, retryDelayMs: 0, onAttemptFailure: (event) => events.push(event) });
  assert.equal(result.attempts, 2); assert.equal(result.data.amount, 10);
  assert.equal(events[0].kind, "incomplete_output"); assert.equal(events[0].willRetry, true);
  assert.doesNotMatch(JSON.stringify(events), /private response|amount|operation|date/);
});

test("recuperación: timeout propio de un intento no aborta el intento de respaldo", async () => {
  const events = []; let calls = 0;
  const result = await recovery.readReceiptWithRecovery(async ({ signal }) => {
    if (++calls === 1) return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    assert.equal(signal.aborted, false); return "read";
  }, { signal: new AbortController().signal, retryDelayMs: 0, attemptTimeoutsMs: [5, 100], onAttemptFailure: (event) => events.push(event) });
  assert.equal(result.data, "read"); assert.equal(result.attempts, 2); assert.equal(events[0].kind, "timeout");
});

test("espera: corta también SDK o respuesta JSON que ignoran AbortSignal", async () => {
  const controller = new AbortController();
  const wait = recovery.receiptTaskWithSignal(() => new Promise(() => {}), controller.signal);
  controller.abort(new DOMException("Deadline", "TimeoutError"));
  await assert.rejects(wait, { name: "TimeoutError" });
  assert.equal(recovery.RECEIPT_READ_CLIENT_TIMEOUT_MS, 25000);
  assert.ok(recovery.RECEIPT_READ_SERVER_TIMEOUT_MS < recovery.RECEIPT_READ_CLIENT_TIMEOUT_MS);
});

test("recuperación: no depende de que el proveedor respete la cancelación", async () => {
  let calls = 0;
  const result = await recovery.readReceiptWithRecovery(async () => {
    if (++calls === 1) return new Promise(() => {});
    return "backup";
  }, { signal: new AbortController().signal, attemptTimeoutsMs: [5, 100], retryDelayMs: 0 });
  assert.equal(result.data, "backup"); assert.equal(result.attempts, 2);
});

test("espera: ignora una resolución tardía y consume su rechazo sin efectos", async () => {
  const controller = new AbortController(); let finish;
  const wait = recovery.receiptTaskWithSignal(() => new Promise((_resolve, reject) => { finish = reject; }), controller.signal);
  await Promise.resolve(); controller.abort(new Error("cancelled"));
  await assert.rejects(wait, /cancelled/); finish(new Error("late rejection"));
  await new Promise((resolve) => setImmediate(resolve));
});

for (const statusCode of [400, 401, 402, 403, 404]) test(`recuperación: no insiste ante error permanente ${statusCode}`, async () => {
  let calls = 0;
  await assert.rejects(() => recovery.readReceiptWithRecovery(async () => { calls++; throw Object.assign(new Error("permanent"), { statusCode }); }, { signal: new AbortController().signal, retryDelayMs: 0 }), /permanent/);
  assert.equal(calls, 1);
});

test("recuperación: limita intentos incluso con fallas repetidas", async () => {
  let calls = 0; const events = [];
  await assert.rejects(() => recovery.readReceiptWithRecovery(async () => { calls++; throw Object.assign(new Error("private response"), { statusCode: 503 }); }, {
    signal: new AbortController().signal, retryDelayMs: 0, attemptTimeoutsMs: [100, 100, 100], onAttemptFailure: (event) => events.push(event),
  }), /private response/);
  assert.equal(calls, 2); assert.equal(events[1].willRetry, false);
});

test("recuperación: cancelar o reemplazar el comprobante impide otra lectura", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(() => recovery.readReceiptWithRecovery(async () => {
    calls++; controller.abort(new Error("cancelled")); throw Object.assign(new Error("upstream"), { statusCode: 503 });
  }, { signal: controller.signal, retryDelayMs: 0 }), /cancelled/);
  assert.equal(calls, 1);
  await assert.rejects(() => recovery.readReceiptWithRecovery(async () => { assert.fail("No llamar IA cancelada"); }, { signal: controller.signal }), /cancelled/);
});

test("recuperación: respeta límites de cuota y Retry-After sin esperas interminables", () => {
  assert.equal(recovery.receiptReadFailure({ statusCode: 502, cause: { statusCode: 401 } }).retryable, false);
  assert.equal(recovery.receiptReadFailure({ statusCode: 429, responseHeaders: { "retry-after": "120" } }).retryable, false);
  assert.equal(recovery.receiptReadFailure({ statusCode: 429, responseHeaders: { "retry-after-ms": "200" } }).retryAfterMs, 200);
  assert.equal(recovery.receiptReadFailure({ cause: { code: "ECONNRESET" } }).kind, "transport");
});
test("API lectura: imagen falsa no llega a IA y limita ráfagas", () => withConfiguredAi(async () => {
  const invalid = new FormData(); invalid.set("receipt", new File(["fake"], "x.png", { type: "image/png" }));
  assert.equal((await readerRoute({ generate: async () => { assert.fail("No enviar imagen falsa"); } }).POST(readingRequest(invalid))).status, 400);
  const route = readerRoute();
  for (let index = 0; index < 5; index++) assert.equal((await route.POST(readingRequest())).status, 200);
  assert.equal((await route.POST(readingRequest())).status, 429);
}));

test("UI: OCR requiere usar sugerencias explícitamente, conserva sólo remitos elegidos", () => {
  const component = readFileSync(new URL("../src/app/payments/payment-receipt-attachment.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../src/app/payments/register-payment-dialog.tsx", import.meta.url), "utf8");
  assert.match(component, /onPaste=/); assert.match(component, /Usar estos datos/); assert.match(component, /request.current !== controller/);
  assert.match(dialog, /if \(method === "transferencia" && receipt\) formData.set\("receipt", receipt\)/);
  assert.doesNotMatch(dialog, /Aplicar crédito|creditMode|setAmounts\(.*reading/);
  assert.match(dialog, /remittances.filter\(\(s\) => Object.hasOwn\(amounts, s.saleId\)\)/);
});

test("descarga: exige permiso, empresa y titularidad CRM antes de firmar la URL", async () => {
  let signed = false;
  const route = load("../src/app/api/payments/receipts/[id]/route.ts", {
    "next/server": { NextResponse: { redirect: (url) => new Response(null, { status: 302, headers: { location: url } }) } },
    "@/lib/api-response": { ApiError, handleApiError: (error) => new Response(null, { status: error.status ?? 500 }) },
    "@/lib/db": { queryWithCompanyContext: async (company, sql, params) => {
      assert.equal(company, 1); assert.match(sql, /empresa_id = \$2/); assert.equal(params[1], 1);
      return { rows: [{ client_id: "other-client", receipt_url: "private" }] };
    } },
    "@/lib/request-body": { uuidParam: (id) => id },
    "@/lib/route-auth": { COLLECTIONS_READ_PERMISSION: {}, CRM_READ_PERMISSION: {}, requireApiSession: async () => session, sessionAllows: async () => false },
    "@/lib/crm": { assertVendorOwnsClient: async () => { throw new ApiError(403, "Cliente ajeno"); } },
    "@/lib/storage": { parseStorageObjectReference: () => ({ bucket: "uploads", path: "recibos/recibo_1_pago_x.png" }), assertCompanyStoragePath: () => undefined, createSignedStorageUrl: async () => { signed = true; return "https://storage.test/private"; } },
  });
  const response = await route.GET(new Request("https://starlim.test"), { params: Promise.resolve({ id: "payment-1" }) });
  assert.equal(response.status, 403); assert.equal(signed, false);
});
