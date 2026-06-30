import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deletePurchase, getPurchase, purchaseIdFromParam, updatePurchaseStatus } from "@/lib/purchases";
import { readRequestBody, textField } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "ver" }]);
    const { id } = await context.params;
    const data = await getPurchase(session.companyId, purchaseIdFromParam(id, "Compra"));
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
    const purchaseId = purchaseIdFromParam(id, "Compra");
    if (!status) return ok({ data: await getPurchase(session.companyId, purchaseId) });
    const data = await updatePurchaseStatus(session.companyId, purchaseId, status);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "cancelar" }]);
    const { id } = await context.params;
    const data = await deletePurchase(session.companyId, purchaseIdFromParam(id, "Compra"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
