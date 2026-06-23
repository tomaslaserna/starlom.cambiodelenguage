import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { acceptQuote } from "@/lib/quotes";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "presupuestos", action: "aprobar" }]);
    const { id } = await context.params;
    const data = await acceptQuote(session.companyId, positiveId(id, "Presupuesto"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

