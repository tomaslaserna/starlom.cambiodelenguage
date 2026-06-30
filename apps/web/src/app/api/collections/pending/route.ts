import { handleApiError, ok } from "@/lib/api-response";
import { listPendingCollections } from "@/lib/collections";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([{ resource: "cobranzas", action: "ver" }]);
    const data = await listPendingCollections(session.companyId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
