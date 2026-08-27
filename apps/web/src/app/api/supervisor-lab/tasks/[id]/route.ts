import { z } from "zod";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";
import { updateSupervisorTask } from "@/lib/supervisor-lab/task-store";

export const runtime = "nodejs";

const actionSchema = z.object({ action: z.enum(["done", "dismiss", "snooze"]) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiSession();
    const { id } = await context.params;
    const payload = actionSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) return Response.json({ ok: false, error: "Accion invalida" }, { status: 400 });
    return ok({ task: await updateSupervisorTask(session, id, payload.data.action) });
  } catch (error) {
    return handleApiError(error);
  }
}
