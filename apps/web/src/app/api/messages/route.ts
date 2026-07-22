import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import {
  getMessageCenterRevision,
  listMessageCenter,
  messageInputFromBody,
  sendMessage,
} from "@/lib/messages";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withPrivateTiming<T extends Response>(response: T, startedAt: number) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Server-Timing", `app;dur=${Date.now() - startedAt}`);
  return response;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const mode = request.nextUrl.searchParams.get("mode") === "revision" ? "revision" : "full";
  try {
    const session = await requireApiSession();
    const data = mode === "revision"
      ? { revision: await getMessageCenterRevision(session) }
      : await listMessageCenter(session);
    const durationMs = Date.now() - startedAt;
    if (mode === "full" || durationMs >= 500) {
      console.info(JSON.stringify({
        level: "info",
        message: "messages.read.completed",
        mode,
        durationMs,
        requestId: request.headers.get("x-vercel-id"),
      }));
    }
    return withPrivateTiming(ok({ data }), startedAt);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const session = await requireApiSession();
    const body = await readRequestBody(request);
    const data = await sendMessage(session, messageInputFromBody(body));
    console.info(JSON.stringify({
      level: "info",
      message: "messages.send.completed",
      durationMs: Date.now() - startedAt,
      messageId: data.id,
      requestId: request.headers.get("x-vercel-id"),
    }));
    return withPrivateTiming(ok({ data }, 201), startedAt);
  } catch (error) {
    return handleApiError(error);
  }
}
