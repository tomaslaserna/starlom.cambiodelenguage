import { handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { requirePortalIdentity } from "@/lib/portal-auth";

export async function PATCH(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const values = [body.notifyOrders === true, body.notifyInvoices === true, body.notifyOffers === true];
    await queryWithCompanyContext(identity.companyId, `UPDATE customer_portal_accounts SET notify_orders=$1, notify_invoices=$2, notify_offers=$3, updated_at=now() WHERE empresa_id=$4 AND id=$5::uuid`, [...values, identity.companyId, identity.accountId], { cache: false });
    return ok({ data: { saved: true } });
  } catch (error) { return handleApiError(error); }
}
