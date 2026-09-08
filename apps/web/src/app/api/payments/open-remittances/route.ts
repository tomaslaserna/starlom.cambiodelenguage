import { handleApiError, ok } from "@/lib/api-response";
import { listOpenCustomerRemittances } from "@/lib/customer-accounts";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_CREATE_PERMISSION, CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION, CRM_READ_PERMISSION]);
    const clientId = uuidParam(new URL(request.url).searchParams.get("clientId") ?? "", "Cliente");
    const data = await listOpenCustomerRemittances(session.companyId, clientId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
