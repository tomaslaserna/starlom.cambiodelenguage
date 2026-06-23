import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { listMessageCenter, messageInputFromBody, sendMessage } from "@/lib/messages";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession();
    const data = await listMessageCenter(session);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession();
    const body = await readRequestBody(request);
    const data = await sendMessage(session, messageInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
