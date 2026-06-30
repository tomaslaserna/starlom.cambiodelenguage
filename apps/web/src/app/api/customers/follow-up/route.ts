import { handleApiError, ok } from "@/lib/api-response";
import { getCustomerFollowUp } from "@/lib/messages";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([{ resource: "clientes", action: "ver" }]);
    const data = await getCustomerFollowUp(session.companyId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
