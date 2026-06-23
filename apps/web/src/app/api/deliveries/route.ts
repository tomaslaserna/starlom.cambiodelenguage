import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { createDelivery, deliveryInputFromBody } from "@/lib/deliveries";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "administrar" }]);
    const body = await readRequestBody(request);
    const data = await createDelivery(session, deliveryInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

