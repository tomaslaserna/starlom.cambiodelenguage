import { handleApiError, ok } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";
import { touchPresence } from "@/lib/presence-store";

export const runtime = "nodejs";

// Heartbeat: records the caller as present and returns the live snapshot of who
// is online in their company. Called on mount and every ~30s by the presence
// indicator in the app header.
export async function POST() {
  try {
    const session = await requireApiSession();
    const data = await touchPresence(session);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
