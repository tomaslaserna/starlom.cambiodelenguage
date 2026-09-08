import { handleApiError, ok } from "@/lib/api-response";
import { getPayment, validWebhookSignature } from "@/lib/mercadopago";
import { processPortalPayment } from "@/lib/portal-payment-processing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const dataId = String(url.searchParams.get("data.id") || body?.data?.id || "");
    const type = String(url.searchParams.get("type") || body?.type || "");
    if (type !== "payment") return ok({ received: true });
    if (!validWebhookSignature(request, dataId)) return Response.json({ ok: false, error: "Firma inválida" }, { status: 401 });
    const payment = await getPayment(dataId);
    await processPortalPayment(payment);
    return ok({ received: true });
  } catch (error) { return handleApiError(error); }
}
