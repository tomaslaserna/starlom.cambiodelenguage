import { handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { findPaymentByExternalReference } from "@/lib/mercadopago";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { processPortalPayment } from "@/lib/portal-payment-processing";

export const runtime = "nodejs";

const PAYMENT_INTENT_TTL_HOURS = 24;

export async function POST(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const intents = await queryWithCompanyContext<{ id: string; expired: boolean }>(identity.companyId, `
      SELECT id::text, created_at < now() - ($4::int * interval '1 hour') expired
        FROM customer_portal_payment_intents
       WHERE empresa_id=$1
         AND portal_account_id=$2::uuid
         AND client_id=ANY($3::uuid[])
         AND status IN ('created','pending')
         AND created_at >= now() - interval '7 days'
       ORDER BY created_at DESC
       LIMIT 10
    `, [identity.companyId, identity.accountId, identity.clientIds, PAYMENT_INTENT_TTL_HOURS], { cache: false });

    let approved = 0;
    let expired = 0;
    for (const intent of intents.rows) {
      const payment = await findPaymentByExternalReference(intent.id);
      if (payment) {
        if (await processPortalPayment(payment, identity.companyId) === "approved") approved += 1;
      } else if (intent.expired) {
        const cancelled = await withCompanyContext(identity.companyId, (client) =>
          client.query(
            `UPDATE customer_portal_payment_intents
                SET status='cancelled',updated_at=now()
              WHERE empresa_id=$1 AND id=$2::uuid AND status IN ('created','pending')
              RETURNING id`,
            [identity.companyId, intent.id],
          ),
        );
        if (cancelled.rowCount) expired += 1;
      }
    }

    return ok({ data: { checked: intents.rows.length, approved, expired } });
  } catch (error) { return handleApiError(error); }
}
