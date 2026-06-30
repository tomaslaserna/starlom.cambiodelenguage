import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { readRequestBody, uuidParam } from "@/lib/request-body";
import { getSalesAdminRecord, updateSalesAdminRecord } from "@/lib/sales-admin";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "editar" }]);
    const { id } = await context.params;
    const data = await getSalesAdminRecord(session.companyId, uuidParam(id, "Venta"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "editar" }]);
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const data = await updateSalesAdminRecord(session, uuidParam(id, "Venta"), body);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
