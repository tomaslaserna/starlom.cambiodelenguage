import test from "node:test";
import assert from "node:assert/strict";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { prepareSupervisorTools } from "../src/lib/supervisor-lab/tool-results.ts";

function createReadAgent(result, prepareTools = prepareSupervisorTools) {
  const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };
  function streamStep(content, reason) {
    return { stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        for (const part of content) controller.enqueue(part);
        controller.enqueue({ type: "finish", finishReason: { unified: reason, raw: reason }, usage });
        controller.close();
      },
    }) };
  }
  const model = new MockLanguageModelV4({
    doStream: [
      streamStep([{ type: "tool-call", toolCallId: "read-1", toolName: "readErpData", input: "{}" }], "tool-calls"),
      streamStep([
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: "Resultado de la consulta." },
        { type: "text-end", id: "answer" },
      ], "stop"),
    ],
  });
  const agent = new ToolLoopAgent({
    model,
    stopWhen: stepCountIs(2),
    tools: prepareTools({
      readErpData: tool({ inputSchema: z.object({}), execute: async () => result }),
    }),
  });
  return { agent, model };
}

test("una fecha de PostgreSQL interrumpe la segunda llamada al modelo si se pasa sin convertir", async () => {
  const { agent, model } = createReadAgent({ rows: [{ next_followup: new Date("2026-11-24T00:00:00Z") }] }, (tools) => tools);
  const stream = await agent.stream({ prompt: "¿Qué clientes compran esta semana?", onError() {} });
  const parts = await Array.fromAsync(stream.fullStream);
  assert.equal(parts.find((part) => part.type === "error")?.error.name, "AI_InvalidPromptError");
  assert.equal(model.doStreamCalls.length, 1);
});

test("LA TIRRA puede redactar usando fechas, importes y valores anidados del ERP", async () => {
  const { agent, model } = createReadAgent({
    rows: [{
      next_followup: "2026-11-24",
      updated_at: new Date("2026-11-24T15:46:19Z"),
      amount: "120143.85",
      count: 9007199254740993n,
      extra: [undefined, null, NaN, Infinity, { missing: undefined, active: false, quantity: 0 }],
    }],
  });
  const response = await agent.stream({ prompt: "¿Qué clientes compran esta semana?" });
  assert.equal(await response.text, "Resultado de la consulta.");
  const result = model.doStreamCalls[1].prompt.find((message) => message.role === "tool").content[0];
  assert.deepEqual(result.output.value, {
    rows: [{
      next_followup: "2026-11-24",
      updated_at: "2026-11-24T15:46:19.000Z",
      amount: "120143.85",
      count: "9007199254740993",
      extra: [null, null, null, null, { active: false, quantity: 0 }],
    }],
  });
});

test("un resultado imposible de serializar falla solo como herramienta y oculta los datos crudos", async () => {
  const invalid = { example: "contenido privado de prueba" };
  invalid.circular = invalid;
  const { agent, model } = createReadAgent(invalid);
  const response = await agent.stream({ prompt: "¿Qué clientes compran esta semana?" });
  assert.equal(await response.text, "Resultado de la consulta.");
  const result = model.doStreamCalls[1].prompt.find((message) => message.role === "tool").content[0];
  assert.equal(result.output.type, "error-text");
  assert.match(result.output.value, /No pude convertir el resultado/);
  assert.doesNotMatch(result.output.value, /privado|circular/);
});

test("una herramienta que emite resultados parciales conserva su streaming", async () => {
  const { readErpData } = prepareSupervisorTools({
    readErpData: tool({
      inputSchema: z.object({}),
      async *execute() {
        yield { complete: false, count: 1n };
        yield { complete: true, closedAt: new Date("2026-11-24T15:46:19Z") };
      },
    }),
  });
  assert.deepEqual(await Array.fromAsync(readErpData.execute({}, {})), [
    { complete: false, count: "1" },
    { complete: true, closedAt: "2026-11-24T15:46:19.000Z" },
  ]);
});
