import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { findPaymentByExternalReference } from "@/lib/mercadopago";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { processPortalPayment } from "@/lib/portal-payment-processing";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requirePortalIdentity(request);
    const { id } = await context.params;
    const readIntent = () => queryWithCompanyContext<{ status: string; amount: string; approved_at: string | null }>(identity.companyId, `SELECT status,amount::text,approved_at::text FROM customer_portal_payment_intents WHERE empresa_id=$1 AND id=$2::uuid AND portal_account_id=$3::uuid`, [identity.companyId, id, identity.accountId], { cache: false });
    let intent = (await readIntent()).rows[0];
    if (!intent) throw new ApiError(404, "Pago no encontrado");

    if (!["approved", "rejected", "cancelled"].includes(intent.status)) {
      const payment = await findPaymentByExternalReference(id);
      if (payment) await processPortalPayment(payment, identity.companyId);
      intent = (await readIntent()).rows[0];
    }

    return ok({ data: { status: intent.status, amount: Number(intent.amount), approvedAt: intent.approved_at } });
  } catch (error) { return handleApiError(error); }
}
