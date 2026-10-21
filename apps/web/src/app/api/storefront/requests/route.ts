import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { createStorefrontRequest, parseStorefrontRequest } from "@/lib/storefront";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { createStorefrontPayment } from "@/lib/storefront-payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 32 * 1024) throw new ApiError(413, "Solicitud demasiado grande");
    const body = await request.json() as Record<string, unknown>;
    const requestedClientId = String(body.portalClientId ?? "");
    let portalClientId = "";
    if (requestedClientId) {
      const identity = await requirePortalIdentity(request);
      if (!identity.clientIds.includes(requestedClientId)) throw new ApiError(403, "Esa sucursal no pertenece a tu cuenta");
      portalClientId = requestedClientId;
    }
    const input = parseStorefrontRequest(body);
    const result = await createStorefrontRequest(input, portalClientId);
    const payment = input.paymentMethod === "qr"
      ? await createStorefrontPayment({ quoteId: result.quoteId, requestKey: input.requestKey, amount: result.amount, email: input.email, origin: new URL(request.url).origin })
      : null;
    return ok({ data: { ...result, payment } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
