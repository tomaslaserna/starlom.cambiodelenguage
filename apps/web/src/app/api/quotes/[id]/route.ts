import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { deleteQuote, getQuote } from "@/lib/quotes";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const data = await getQuote(companyIdFromRequest(request), positiveId(id, "Presupuesto"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "presupuestos", action: "cancelar" }]);
    const { id } = await context.params;
    const data = await deleteQuote(session.companyId, positiveId(id, "Presupuesto"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

