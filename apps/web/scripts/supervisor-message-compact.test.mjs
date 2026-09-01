import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/lib/supervisor-lab/message-compact.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("module", "exports", compiled)(module, module.exports);
const { compactSupervisorMessages } = module.exports;

test("el contexto elimina metadatos del proveedor y conserva solo el texto útil", () => {
  const oversizedSignature = "x".repeat(75_000);
  const compacted = compactSupervisorMessages([
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "¿Qué suele comprar PINAR EVENTOS?" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "tool-getCustomerProductPattern", toolCallId: "call-1", state: "output-available", input: {}, output: { rows: oversizedSignature } },
        { type: "text", text: "Suele comprar bobinas industriales." },
      ],
      providerMetadata: { vertex: { thoughtSignature: oversizedSignature } },
    },
  ]);

  const serialized = JSON.stringify(compacted);
  assert.equal(compacted.length, 2);
  assert.equal(compacted[1].parts[0].text, "Suele comprar bobinas industriales.");
  assert.doesNotMatch(serialized, /thoughtSignature|tool-getCustomerProductPattern/);
  assert.ok(Buffer.byteLength(serialized, "utf8") < 10_000);
});

test("el contexto conserva los últimos doce mensajes y limita cada texto", () => {
  const messages = Array.from({ length: 14 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 ? "assistant" : "user",
    parts: [{ type: "text", text: `${index}:${"a".repeat(3_000)}` }],
  }));
  const compacted = compactSupervisorMessages(messages);

  assert.equal(compacted.length, 12);
  assert.equal(compacted[0].id, "message-2");
  assert.equal(compacted.at(-1)?.id, "message-13");
  assert.equal(compacted[0].parts[0].text.length, 2_500);
});
