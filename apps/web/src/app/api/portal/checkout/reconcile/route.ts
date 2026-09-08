import { handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { findPaymentByExternalReference } from "@/lib/mercadopago";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { processPortalPayment } from "@/lib/portal-payment-processing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const intents = await queryWithCompanyContext<{ id: string }>(identity.companyId, `
      SELECT id::text
        FROM customer_portal_payment_intents
       WHERE empresa_id=$1
         AND portal_account_id=$2::uuid
         AND client_id=ANY($3::uuid[])
         AND status IN ('created','pending')
         AND created_at >= now() - interval '7 days'
       ORDER BY created_at DESC
       LIMIT 10
    `, [identity.companyId, identity.accountId, identity.clientIds], { cache: false });

    let approved = 0;
    for (const intent of intents.rows) {
      const payment = await findPaymentByExternalReference(intent.id);
      if (payment && await processPortalPayment(payment, identity.companyId) === "approved") approved += 1;
    }

    return ok({ data: { checked: intents.rows.length, approved } });
  } catch (error) { return handleApiError(error); }
}
