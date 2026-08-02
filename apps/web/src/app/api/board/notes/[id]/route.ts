import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deleteBoardNote, updateBoardNote } from "@/lib/board";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const { id } = await context.params;
    const body = await readRequestBody(request, 8 * 1024);
    const patch: { text?: string; color?: string; x?: number; y?: number } = {};
    if (typeof body.text === "string") patch.text = body.text;
    if (typeof body.color === "string") patch.color = body.color;
    if (body.x !== undefined) patch.x = Number(body.x);
    if (body.y !== undefined) patch.y = Number(body.y);
    await updateBoardNote(session, id, patch);
    return ok({ data: { ok: true } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const { id } = await context.params;
    await deleteBoardNote(session, id);
    return ok({ data: { ok: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
