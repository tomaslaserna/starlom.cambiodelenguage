import { handleApiError, ok } from "@/lib/api-response";
import { markMessagesRead } from "@/lib/messages";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await requireApiSession();
    const data = await markMessagesRead(session);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
