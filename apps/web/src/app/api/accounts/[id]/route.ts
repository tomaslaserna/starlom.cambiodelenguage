import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deleteAccountMovement } from "@/lib/accounts";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "cobranzas", action: "editar" }]);
    const { id } = await context.params;
    const data = await deleteAccountMovement(session.companyId, uuidParam(id, "Movimiento"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
