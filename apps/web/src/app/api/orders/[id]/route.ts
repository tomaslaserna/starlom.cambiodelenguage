import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { getOrder } from "@/lib/orders";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "ver" }]);
    const { id } = await context.params;
    const data = await getOrder(session.companyId, uuidParam(id, "Pedido"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
