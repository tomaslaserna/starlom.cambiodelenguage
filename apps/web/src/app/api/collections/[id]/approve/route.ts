import { type NextRequest } from "next/server";
import { approveCollection } from "@/lib/collections";
import { handleApiError, ok } from "@/lib/api-response";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "cobranzas", action: "aprobar" }]);
    const { id } = await context.params;
    const data = await approveCollection(session, uuidParam(id, "Venta"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
