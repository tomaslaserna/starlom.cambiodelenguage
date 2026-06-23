import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { createTask, listTasks } from "@/lib/messages";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession();
    const searchParams = request.nextUrl.searchParams;
    const data = await listTasks(
      session,
      searchParams.get("q") ?? searchParams.get("buscar") ?? "",
      searchParams.get("order") ?? searchParams.get("orden") ?? "prioridad",
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession();
    const body = await readRequestBody(request);
    const data = await createTask(session, body);
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
