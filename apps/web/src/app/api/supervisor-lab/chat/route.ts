import { randomUUID } from "node:crypto";
import { createAgentUIStreamResponse } from "ai";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";
import { createStarlimSupervisorAgent } from "@/lib/supervisor-lab/agent";
import { assertSupervisorAiConfigured } from "@/lib/supervisor-lab/availability";
import { parseSupervisorRequestBody } from "@/lib/supervisor-lab/request-guard";
import { getSupervisorLandingSummary } from "@/lib/supervisor-lab/landing-summary";
import {
  clearSupervisorChatMemory,
  getSupervisorChatMemory,
  saveSupervisorChatMemory,
  SUPERVISOR_MEMORY_HOURS,
} from "@/lib/supervisor-lab/chat-memory";
import type { StarlimSupervisorMessage } from "@/lib/supervisor-lab/agent";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession();
    const messages = await getSupervisorChatMemory(session);
    return ok({ messages, memoryHours: SUPERVISOR_MEMORY_HOURS });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const session = await requireApiSession();
    await clearSupervisorChatMemory(session);
    return ok({ cleared: true });
  } catch (error) {
    return handleApiError(error);
  }
}

function logSupervisorStreamError(error: unknown) {
  const details =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "UnknownError", message: String(error) };

  console.error(
    JSON.stringify({
      level: "error",
      event: "Supervisor stream failed",
      route: "/api/supervisor-lab/chat",
      ...details,
    }),
  );

  return "No se pudo completar la consulta. Reintentá o avisá al administrador.";
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  try {
    const session = await requireApiSession();
    try {
      assertSupervisorAiConfigured();
    } catch (error) {
      if (error instanceof Error && error.message === "SUPERVISOR_AI_DISABLED") {
        throw new ApiError(404, "LA TIRRA ia.01 no está habilitada");
      }
      throw new ApiError(503, "LA TIRRA ia.01 no está configurada");
    }

    const body = await request.json().catch(() => null);
    const uiMessages = parseSupervisorRequestBody(body) as StarlimSupervisorMessage[];
    console.info(JSON.stringify({ level: "info", event: "Supervisor request started", requestId, messageCount: uiMessages.length }));
    await saveSupervisorChatMemory(session, uiMessages);
    const summary = await getSupervisorLandingSummary(session);
    return createAgentUIStreamResponse({
      agent: createStarlimSupervisorAgent(session, summary),
      uiMessages,
      originalMessages: uiMessages,
      generateMessageId: randomUUID,
      abortSignal: request.signal,
      timeout: { totalMs: 28_000 },
      sendSources: true,
      onEnd: async ({ messages }) => {
        await saveSupervisorChatMemory(session, messages);
        console.info(JSON.stringify({ level: "info", event: "Supervisor request completed", requestId, durationMs: Date.now() - startedAt }));
      },
      onError: logSupervisorStreamError,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
