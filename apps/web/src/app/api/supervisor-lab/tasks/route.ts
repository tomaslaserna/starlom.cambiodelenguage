import { handleApiError, ok } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";
import { generateSupervisorTasks, listSupervisorTasks } from "@/lib/supervisor-lab/task-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession();
    return ok({ tasks: await listSupervisorTasks(session) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    const session = await requireApiSession();
    return ok({ generation: await generateSupervisorTasks(session) });
  } catch (error) {
    return handleApiError(error);
  }
}
