import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { getDeliveryItems } from "@/lib/deliveries";
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
    const data = await getDeliveryItems(session.companyId, uuidParam(id, "Remito"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
