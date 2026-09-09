import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { findPaymentByExternalReference } from "@/lib/mercadopago";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { processPortalPayment } from "@/lib/portal-payment-processing";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requirePortalIdentity(request);
    const { id } = await context.params;
    const readIntent = () =>
      queryWithCompanyContext<{
        status: string;
        amount: string;
        approved_at: string | null;
        purpose: string;
        order_number: string | null;
      }>(
        identity.companyId,
        `SELECT i.status,i.amount::text,i.approved_at::text,CASE WHEN q.id IS NULL THEN 'account_payment' ELSE 'order_payment' END purpose,s.sale_number order_number
           FROM customer_portal_payment_intents i
           LEFT JOIN quotes q ON q.id=i.sale_ids[1] AND q.empresa_id=i.empresa_id
           LEFT JOIN sales s ON s.id=q.converted_order_id AND s.empresa_id=q.empresa_id
          WHERE i.empresa_id=$1 AND i.id=$2::uuid AND i.portal_account_id=$3::uuid`,
        [identity.companyId, id, identity.accountId],
        { cache: false },
      );
    let intent = (await readIntent()).rows[0];
    if (!intent) throw new ApiError(404, "Pago no encontrado");

    if (!["approved", "rejected", "cancelled"].includes(intent.status)) {
      const payment = await findPaymentByExternalReference(id);
      if (payment) await processPortalPayment(payment, identity.companyId);
      intent = (await readIntent()).rows[0];
    }

    return ok({
      data: {
        status: intent.status,
        amount: Number(intent.amount),
        approvedAt: intent.approved_at,
        purpose: intent.purpose,
        orderNumber: intent.order_number,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
