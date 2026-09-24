import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { findPaymentByExternalReference } from "@/lib/mercadopago";
import { processStorefrontPayment } from "@/lib/storefront-payments";

export const runtime = "nodejs";
const COMPANY_ID = 1;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const key = new URL(request.url).searchParams.get("key") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(key)) throw new ApiError(400, "Identificador de pago inválido");
    const read = () => queryWithCompanyContext<{ status: string; amount: string; approved_at: string | null; order_number: string | null }>(
      COMPANY_ID,
      `SELECT i.status,i.amount::text,i.approved_at::text,s.sale_number order_number
         FROM storefront_payment_intents i
         JOIN quotes q ON q.id=i.quote_id AND q.empresa_id=i.empresa_id
         LEFT JOIN sales s ON s.id=q.converted_order_id AND s.empresa_id=q.empresa_id
        WHERE i.empresa_id=$1 AND i.id=$2::uuid AND i.request_key=$3::uuid`,
      [COMPANY_ID, id, key], { cache: false },
    );
    let intent = (await read()).rows[0];
    if (!intent) throw new ApiError(404, "Pago no encontrado");
    if (!["approved", "rejected", "cancelled"].includes(intent.status)) {
      const payment = await findPaymentByExternalReference(id);
      if (payment) await processStorefrontPayment(payment, COMPANY_ID);
      intent = (await read()).rows[0];
    }
    return ok({ data: { status: intent.status, amount: Number(intent.amount), approvedAt: intent.approved_at, orderNumber: intent.order_number } });
  } catch (error) { return handleApiError(error); }
}
