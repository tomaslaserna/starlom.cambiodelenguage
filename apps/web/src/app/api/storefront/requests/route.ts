import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { createStorefrontRequest, parseStorefrontRequest } from "@/lib/storefront";
import { requirePortalIdentity } from "@/lib/portal-auth";

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
    const result = await createStorefrontRequest(parseStorefrontRequest(body), portalClientId);
    return ok({ data: result }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
