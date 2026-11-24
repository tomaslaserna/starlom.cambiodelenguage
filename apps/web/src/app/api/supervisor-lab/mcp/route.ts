import { after } from "next/server";
import { ApiError } from "@/lib/api-response";
import { dotOrigin, dotPrincipal } from "@/lib/supervisor-lab/dot-auth";
import { handleDotRpc } from "@/lib/supervisor-lab/dot-mcp";
import { dispatchDotQuestions } from "@/lib/supervisor-lab/dot-store";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  let id: unknown = null;
  try {
    const owner = await dotPrincipal(request);
    if (Number(request.headers.get("content-length") ?? 0) > 65536)
      throw new ApiError(413, "Solicitud demasiado grande");
    const body = await request.json();
    id = body?.id ?? null;
    const response = await handleDotRpc(owner, body);
    if (body?.method === "events/subscribe" && response && "result" in response)
      after(() => dispatchDotQuestions(owner));
    if (response === null) return new Response(null, { status: 202 });
    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      return Response.json(
        { error: "unauthorized" },
        {
          status: 401,
          headers: {
            "WWW-Authenticate": `Bearer resource_metadata="${dotOrigin()}/.well-known/oauth-protected-resource", scope="starlim:consult"`,
          },
        },
      );
    return Response.json(
      {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32602,
          message:
            error instanceof ApiError
              ? error.message
              : "Solicitud MCP inválida",
        },
      },
      { status: error instanceof ApiError ? error.status : 400 },
    );
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
