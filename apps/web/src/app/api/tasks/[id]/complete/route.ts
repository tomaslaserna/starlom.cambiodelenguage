import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { completeTask, completionInputFromBody } from "@/lib/messages";
import { positiveId, readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const data = await completeTask(
      session,
      positiveId(id, "Tarea"),
      completionInputFromBody(body),
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
