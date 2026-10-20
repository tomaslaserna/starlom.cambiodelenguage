import { handleApiError, ok } from "@/lib/api-response";
import { getCustomerPaymentContext } from "@/lib/customer-accounts";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_CREATE_PERMISSION, CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION, CRM_READ_PERMISSION]);
    const clientId = uuidParam(new URL(request.url).searchParams.get("clientId") ?? "", "Cliente");
    const { data, reconciliation } = await getCustomerPaymentContext(session.companyId, clientId);
    return ok({ data, reconciliation });
  } catch (error) {
    return handleApiError(error);
  }
}
