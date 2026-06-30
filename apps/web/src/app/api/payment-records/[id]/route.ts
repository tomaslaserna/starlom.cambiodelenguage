import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deletePaymentRecord } from "@/lib/accounts";
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
    const data = await deletePaymentRecord(session.companyId, uuidParam(id, "Registro"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
