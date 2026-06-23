import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import {
  createDeliveryDocumentFromSale,
  deliveryFromSaleInputFromBody,
} from "@/lib/deliveries";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "editar" }]);
    const body = await readRequestBody(request);
    const input = deliveryFromSaleInputFromBody(body);
    const data = await createDeliveryDocumentFromSale(session, input.saleId);
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
