import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import {
  getProduct,
  productUpdateInputFromBody,
  updateProduct,
} from "@/lib/catalog-management";
import { positiveId, readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const data = await getProduct(companyIdFromRequest(request), positiveId(id));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([
      { resource: "productos", action: "editar" },
      { resource: "stock", action: "editar" },
    ]);
    const { id } = await context.params;
    const productId = positiveId(id);
    const body = await readRequestBody(request);
    const current = await getProduct(session.companyId, productId);
    const result = await updateProduct(session, productId, productUpdateInputFromBody(body, current));
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
