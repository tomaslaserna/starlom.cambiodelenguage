import type { ToolSet } from "ai";

/** Tool results go to both the model's JSON schema and the chat stream. */
export function prepareSupervisorTools<Tools extends ToolSet>(tools: Tools): Tools {
  for (const definition of Object.values(tools)) {
    const execute = definition.execute;
    if (!execute) continue;

    definition.execute = (input, options) => {
      const result = execute(input, options);
      if (result && typeof result === "object" && Symbol.asyncIterator in result && typeof result[Symbol.asyncIterator] === "function") {
        return serializeToolStream(result as AsyncIterable<unknown>);
      }
      return Promise.resolve(result).then(serializeToolResult);
    };
  }
  return tools;
}

async function* serializeToolStream(stream: AsyncIterable<unknown>) {
  for await (const result of stream) yield serializeToolResult(result);
}

function serializeToolResult(result: unknown): unknown {
  try {
    // Date.toJSON produces ISO strings. Keep large integers exact and let JSON
    // handle missing properties and non-finite numbers consistently with the UI.
    const json = JSON.stringify(result, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    if (json !== undefined) return JSON.parse(json);
  } catch {
    // Don't expose raw ERP records from a failed serialization.
  }
  throw new Error("No pude convertir el resultado de esta consulta del ERP a un formato legible.");
}
