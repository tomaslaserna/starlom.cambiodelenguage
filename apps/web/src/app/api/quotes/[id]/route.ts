import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deleteQuote, getQuote } from "@/lib/quotes";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "presupuestos", action: "ver" }]);
    const { id } = await context.params;
    const data = await getQuote(session.companyId, id);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "presupuestos", action: "cancelar" }]);
    const { id } = await context.params;
    const data = await deleteQuote(session.companyId, id);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
