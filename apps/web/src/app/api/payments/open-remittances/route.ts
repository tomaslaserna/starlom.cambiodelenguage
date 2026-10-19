import { handleApiError, ok } from "@/lib/api-response";
import { listOpenCustomerRemittances, listCustomerAvailableCredits } from "@/lib/customer-accounts";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_APPROVE_PERMISSION, COLLECTIONS_CREATE_PERMISSION, CRM_READ_PERMISSION, requireApiSession, sessionAllows } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION, CRM_READ_PERMISSION]);
    const clientId = uuidParam(new URL(request.url).searchParams.get("clientId") ?? "", "Cliente");
    const [data, credits, canApplyCredit] = await Promise.all([
      listOpenCustomerRemittances(session.companyId, clientId),
      listCustomerAvailableCredits(session.companyId, clientId),
      sessionAllows(session, [COLLECTIONS_APPROVE_PERMISSION]),
    ]);
    return ok({ data, credits, canApplyCredit });
  } catch (error) {
    return handleApiError(error);
  }
}
