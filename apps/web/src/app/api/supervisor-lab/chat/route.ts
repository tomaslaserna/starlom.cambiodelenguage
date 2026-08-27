import { createAgentUIStreamResponse } from "ai";
import { ApiError, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";
import { createStarlimSupervisorAgent } from "@/lib/supervisor-lab/agent";
import { assertSupervisorAiConfigured } from "@/lib/supervisor-lab/availability";
import { parseSupervisorRequestBody } from "@/lib/supervisor-lab/request-guard";
import { getSupervisorLandingSummary } from "@/lib/supervisor-lab/landing-summary";

export const runtime = "nodejs";

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
    const uiMessages = parseSupervisorRequestBody(body);
    const summary = await getSupervisorLandingSummary(session);
    return createAgentUIStreamResponse({
      agent: createStarlimSupervisorAgent(session, summary),
      uiMessages,
      abortSignal: request.signal,
      timeout: { totalMs: 45_000 },
      sendSources: true,
      onError: logSupervisorStreamError,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
