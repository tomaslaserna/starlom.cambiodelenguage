import test from "node:test";
import assert from "node:assert/strict";
import { createAgentUIStream, createUIMessageStream, readUIMessageStream, generateText, ToolLoopAgent, stepCountIs, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { compactSupervisorEvidence, supervisorAnswerRecovery } from "../src/lib/supervisor-lab/answer-recovery.ts";
import { supervisorToolStateLabel } from "../src/lib/supervisor-lab/tool-state.ts";

const fromChunks = (chunks) => new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } });
async function collect(chunks, options) {
  const result = [];
  for await (const chunk of fromChunks(chunks).pipeThrough(supervisorAnswerRecovery({ generateId: () => "recovery-text", ...options }))) result.push(chunk);
  return result;
}
const toolsOnly = [
  { type: "start", messageId: "assistant" }, { type: "start-step" },
  { type: "tool-input-available", toolName: "getCustomerProductPattern", toolCallId: "pattern", input: { search: "universita it" } },
  { type: "tool-output-available", toolCallId: "pattern", output: { customerNames: ["UNIVERSITA IT"], products: [] } },
  { type: "tool-input-start", toolName: "getCustomerInvoices", toolCallId: "pending-invoices" },
  { type: "tool-input-available", toolName: "getCustomerInvoices", toolCallId: "invoices", input: { search: "universita it", limit: 2 } },
  { type: "tool-output-available", toolCallId: "invoices", output: { invoices: [] } },
  { type: "finish-step" }, { type: "finish", finishReason: "tool-calls" },
];

test("la secuencia de la captura obtiene texto final automáticamente y lo conserva en memoria", async () => {
  let recoveries = 0;
  let savedMessages;
  const recoveryText = "No encontré facturas en la consulta. Eso no demuestra que no haya pedidos; falta consultar el historial de pedidos para calcular el total.";
  const stream = createUIMessageStream({
    originalMessages: [{ id: "user", role: "user", parts: [{ type: "text", text: "Cada cuánto compra y cuál fue el último pedido de Universita IT" }] }],
    execute: ({ writer }) => writer.merge(fromChunks(toolsOnly).pipeThrough(supervisorAnswerRecovery({
      generateId: () => "answer", recover: async () => { recoveries++; return recoveryText; },
    }))),
    onEnd: ({ messages }) => { savedMessages = messages; },
  });
  let visibleMessage;
  for await (const message of readUIMessageStream({ stream })) visibleMessage = message;
  assert.equal(recoveries, 1);
  assert.equal(visibleMessage.parts.find((part) => part.type === "text").text, recoveryText);
  assert.equal(savedMessages.at(-1).parts.find((part) => part.type === "text").text, recoveryText);
  assert.equal(visibleMessage.parts.filter((part) => part.type.startsWith("tool-")).length, 3);
});

test("integra el SDK: herramienta, respuesta vacía del proveedor y redacción sin herramientas", async () => {
  const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };
  const finish = (reason) => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage });
  const model = new MockLanguageModelV4({
    doStream: [
      { stream: fromChunks([{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: "summary", toolName: "getCustomerOrderSummary", input: '{"search":"universita it"}' }, finish("tool-calls")]) },
      { stream: fromChunks([{ type: "stream-start", warnings: [] }, finish("stop")]) },
    ],
    doGenerate: { content: [{ type: "text", text: "En la prueba, compra cada 26 días." }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] },
  });
  const agent = new ToolLoopAgent({ model, stopWhen: stepCountIs(3), tools: {
    getCustomerOrderSummary: tool({ inputSchema: z.object({ search: z.string() }), execute: async () => ({ averageDays: 26 }) }),
  } });
  const evidence = [];
  const agentStream = await createAgentUIStream({
    agent,
    uiMessages: [{ id: "q", role: "user", parts: [{ type: "text", text: "Cada cuánto compra Universita IT" }] }],
    onStepEnd: ({ toolResults }) => evidence.push(...toolResults.map(({ toolName, output }) => ({ toolName, output }))),
  });
  let answer;
  for await (const message of readUIMessageStream({ stream: agentStream.pipeThrough(supervisorAnswerRecovery({
    generateId: () => "recovered",
    recover: async () => (await generateText({ model, prompt: JSON.stringify(compactSupervisorEvidence(evidence)), maxRetries: 0 })).text,
  })) })) answer = message;
  assert.equal(model.doStreamCalls.length, 2);
  assert.equal(model.doGenerateCalls.length, 1);
  assert.ok(!model.doGenerateCalls[0].tools?.length);
  assert.match(JSON.stringify(model.doGenerateCalls[0].prompt), /averageDays/);
  assert.equal(answer.parts.find((part) => part.type === "text").text, "En la prueba, compra cada 26 días.");
});

test("una respuesta normal no dispara otra inferencia ni duplica el cierre", async () => {
  const chunks = [{ type: "start" }, { type: "start-step" }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Respuesta" }, { type: "text-end", id: "t" }, { type: "finish-step" }, { type: "finish", finishReason: "stop" }];
  const result = await collect(chunks, { recover: async () => { assert.fail("No corresponde recuperar"); } });
  assert.deepEqual(result, chunks);
});

test("un preámbulo en un paso anterior no reemplaza la respuesta tras consultar datos", async () => {
  const result = await collect([
    { type: "start" }, { type: "start-step" }, { type: "text-start", id: "p" },
    { type: "text-delta", id: "p", delta: "Voy a consultar." }, { type: "text-end", id: "p" }, { type: "finish-step" },
    { type: "start-step" }, { type: "finish-step" }, { type: "finish", finishReason: "stop" },
  ], { recover: async () => "Resultado final" });
  assert.equal(result.filter((chunk) => chunk.type === "text-delta").at(-1).delta, "Resultado final");
});

test("si la recuperación también queda vacía, devuelve un error explícito sin bucles", async () => {
  let count = 0;
  const result = await collect(toolsOnly, { recover: async () => { count++; return "  "; } });
  assert.equal(count, 1);
  assert.equal(result.at(-1).finishReason, "error");
  assert.match(result.find((chunk) => chunk.type === "error").errorText, /recuperarla automáticamente/);
});

test("no filtra errores internos cuando falla la recuperación", async () => {
  const result = await collect(toolsOnly, { recover: async () => { throw new Error("PRIVATE_ERROR_DETAIL"); } });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ERROR_DETAIL/);
  assert.equal(result.at(-1).finishReason, "error");
});

test("errores o cancelaciones no desencadenan una recuperación ni una respuesta tardía", async () => {
  const cancelled = new AbortController(); cancelled.abort();
  for (const chunks of [[{ type: "error", errorText: "Fallo" }], [{ type: "abort" }], toolsOnly]) {
    await collect(chunks, { signal: chunks === toolsOnly ? cancelled.signal : undefined, recover: async () => { assert.fail("No debe llamar al modelo"); } });
  }
  const duringRecovery = new AbortController();
  const result = await collect(toolsOnly, { signal: duringRecovery.signal, recover: async () => { duringRecovery.abort(); return "No debe aparecer"; } });
  assert.equal(result.at(-1).type, "abort");
  assert.ok(!result.some((chunk) => chunk.type === "text-delta"));
});

test("acota evidencia y marca resultados truncados sin inventar cobertura", () => {
  const evidence = compactSupervisorEvidence(Array.from({ length: 12 }, (_, index) => ({ toolName: `tool-${index}`, output: index === 11 ? "x".repeat(10000) : { total: index } })));
  assert.equal(evidence.length, 8);
  assert.equal(evidence[0].toolName, "tool-4");
  assert.deepEqual(evidence[0].output, { total: 4 });
  assert.equal(evidence.at(-1).output.truncated, true);
  assert.equal(evidence.at(-1).output.preview.length, 6000);
});

test("una herramienta ya terminada no sigue figurando en curso cuando no hay ejecución activa", () => {
  assert.equal(supervisorToolStateLabel("output-available", false), "listo");
  assert.equal(supervisorToolStateLabel("output-error", false), "sin resultado");
  assert.equal(supervisorToolStateLabel("input-available", false), "sin completar");
  assert.equal(supervisorToolStateLabel("input-streaming", true), "en curso");
});
