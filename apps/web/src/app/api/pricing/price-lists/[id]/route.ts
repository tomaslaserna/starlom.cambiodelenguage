import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deactivatePriceList, priceListInputFromBody, updatePriceList } from "@/lib/pricing";
import { positiveId, readRequestBody } from "@/lib/request-body";
import { requireAdminApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAdminApiSession();
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const data = await updatePriceList(
      session.companyId,
      positiveId(id, "Lista"),
      priceListInputFromBody(body),
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAdminApiSession();
    const { id } = await context.params;
    const data = await deactivatePriceList(session.companyId, positiveId(id, "Lista"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
