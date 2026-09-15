import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { acceptQuote } from "@/lib/quotes";
import type { AuthSession } from "@/lib/auth";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const identity = await requirePortalIdentity(request);
    const { id } = await context.params;
    const body = await request.json() as { action?: string; note?: string };
    const action = body.action;
    const note = String(body.note ?? "").trim();
    if (!["approve", "reject"].includes(action ?? "")) throw new ApiError(400, "Acción inválida");
    if (action === "reject" && !note) throw new ApiError(400, "Indicá qué querés cambiar o por qué rechazás el presupuesto");

    const found = await queryWithCompanyContext<{ seller_id: string | null }>(
      identity.companyId,
      `SELECT seller_id::text FROM quotes WHERE id=$1::uuid AND empresa_id=$2 AND client_id=ANY($3::uuid[]) AND status='pendiente' AND created_at::date + validity_days >= CURRENT_DATE`,
      [id, identity.companyId, identity.clientIds],
      { cache: false },
    );
    if (!found.rows[0]) throw new ApiError(409, "El presupuesto venció o ya fue respondido");

    if (action === "reject") {
      await withCompanyContext(identity.companyId, (client) => client.query(
        `UPDATE quotes SET status='rechazada', notes=CONCAT_WS(E'\\n',NULLIF(notes,''),$4), updated_at=now() WHERE id=$1::uuid AND empresa_id=$2 AND client_id=ANY($3::uuid[]) AND status='pendiente' AND created_at::date + validity_days >= CURRENT_DATE`,
        [id, identity.companyId, identity.clientIds, `Respuesta del portal: ${note}`],
      ));
      return ok({ data: { id, status: "rechazada" } });
    }

    const session: AuthSession = { userId: found.rows[0].seller_id || identity.userId, username: identity.displayName, email: identity.email, displayName: identity.displayName, role: "vendedor", companyId: identity.companyId, companyName: "Starlim", expiresAt: Math.floor(Date.now()/1000)+300 };
    const accepted = await acceptQuote(session, id);
    return ok({ data: { id, status: "aceptada", orderId: accepted.orderId } });
  } catch (error) { return handleApiError(error); }
}
