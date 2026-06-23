import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { orderStatusFromBody, updateOrderStatus } from "@/lib/orders";
import { positiveId, readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "editar" }]);
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const data = await updateOrderStatus(session, positiveId(id), orderStatusFromBody(body));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

