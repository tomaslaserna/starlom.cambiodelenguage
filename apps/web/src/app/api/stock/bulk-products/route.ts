import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { bulkUpdateProducts, productBulkUpdateInputFromBody } from "@/lib/imports";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "stock", action: "editar" }]);
    const body = await readRequestBody(request);
    const data = await bulkUpdateProducts(session, productBulkUpdateInputFromBody(body));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
