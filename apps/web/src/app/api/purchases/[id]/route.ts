import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { deletePurchase, getPurchase, updatePurchaseStatus } from "@/lib/purchases";
import { positiveId, readRequestBody, textField } from "@/lib/request-body";
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
    const data = await getPurchase(companyIdFromRequest(request), positiveId(id, "Compra"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "editar" }]);
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const status = textField(body, "status") || textField(body, "estado");
    if (!status) return ok({ data: await getPurchase(session.companyId, positiveId(id, "Compra")) });
    const data = await updatePurchaseStatus(session.companyId, positiveId(id, "Compra"), status);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "cancelar" }]);
    const { id } = await context.params;
    const data = await deletePurchase(session.companyId, positiveId(id, "Compra"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

