import { ApiError } from "@/lib/api-response";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { uuidParam } from "@/lib/request-body";

export async function requirePortalStatementAccess(request: Request, rawClientId: string) {
  const identity = await requirePortalIdentity(request);
  const clientId = uuidParam(rawClientId, "Cliente");
  if (!identity.clientIds.includes(clientId)) throw new ApiError(404, "La cuenta no pertenece a tu usuario");
  return { companyId: identity.companyId, clientId };
}
