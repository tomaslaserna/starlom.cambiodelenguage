import type { UIMessageChunk } from "ai";

export type SupervisorEvidence = { toolName: string; output: unknown };

/** Bound recovery context and mark partial evidence rather than inventing coverage. */
export function compactSupervisorEvidence(results: SupervisorEvidence[]) {
  return results.slice(-8).map(({ toolName, output }) => {
    const serialized = JSON.stringify(output) ?? "null";
    return { toolName, output: serialized.length <= 6000 ? output : {
      truncated: true,
      preview: serialized.slice(0, 6000),
      limitation: "Resultado parcial: no inferir totales, ausencia de datos ni cobertura completa desde este fragmento.",
    } };
  });
}

/** Reserve one writing attempt if a completed agent run contains only tools. */
export function supervisorAnswerRecovery<C extends UIMessageChunk>({
  recover,
  generateId,
  signal,
  onRecovery,
}: {
  recover: () => Promise<string>;
  generateId: () => string;
  signal?: AbortSignal;
  onRecovery?: (state: "started" | "completed" | "failed", textCharacters?: number) => void;
}) {
  let hasText = false;
  let failed = false;
  let aborted = false;
  let started = false;
  let finish: C | undefined;
  return new TransformStream<C, C>({
    transform(chunk, controller) {
      if (chunk.type === "finish") { finish = chunk; return; }
      if (chunk.type === "start") started = true;
      if (chunk.type === "start-step" || chunk.type === "reset-step") hasText = false;
      if (chunk.type === "text-delta" && chunk.delta.trim()) hasText = true;
      if (chunk.type === "error") failed = true;
      if (chunk.type === "abort") aborted = true;
      controller.enqueue(chunk);
    },
    async flush(controller) {
      if (!hasText && !failed && !aborted && !signal?.aborted) {
        onRecovery?.("started");
        try {
          const text = (await recover()).trim();
          if (signal?.aborted) { controller.enqueue({ type: "abort" } as C); return; }
          if (!text) throw new Error("Empty recovery answer");
          const id = generateId();
          if (!started) controller.enqueue({ type: "start" } as C);
          controller.enqueue({ type: "start-step" } as C);
          controller.enqueue({ type: "text-start", id } as C);
          controller.enqueue({ type: "text-delta", id, delta: text } as C);
          controller.enqueue({ type: "text-end", id } as C);
          controller.enqueue({ type: "finish-step" } as C);
          finish = { type: "finish", finishReason: "stop" } as C;
          onRecovery?.("completed", text.length);
        } catch {
          if (signal?.aborted) { controller.enqueue({ type: "abort" } as C); return; }
          failed = true;
          onRecovery?.("failed");
          controller.enqueue({ type: "error", errorText: "No pude completar la redacción, incluso después de intentar recuperarla automáticamente. Podés reintentar la consulta." } as C);
        }
      }
      if (signal?.aborted || aborted) return;
      controller.enqueue(failed ? { type: "finish", finishReason: "error" } as C : finish ?? { type: "finish", finishReason: "stop" } as C);
    },
  });
}
