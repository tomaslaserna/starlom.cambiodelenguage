import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { getDeliveryItems } from "@/lib/deliveries";
import { positiveId } from "@/lib/request-body";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const data = await getDeliveryItems(companyIdFromRequest(request), positiveId(id, "Remito"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
