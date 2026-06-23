import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import {
  customerInputFromBody,
  getCustomer,
  updateCustomer,
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
    const data = await getCustomer(companyIdFromRequest(request), positiveId(id));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
    const { id } = await context.params;
    const customerId = positiveId(id);
    const body = await readRequestBody(request);
    const current = await getCustomer(session.companyId, customerId);
    const data = await updateCustomer(
      session.companyId,
      customerId,
      customerInputFromBody(body, {
        name: current.name,
        businessName: current.businessName,
        taxIdType: current.taxIdType,
        taxId: current.taxId,
        vatCondition: current.vatCondition,
        phone: current.phone,
        address: current.address,
        city: current.city,
        province: current.province,
        priceList: current.priceList,
        status: current.status,
        seller: current.seller,
        observation: current.observation,
      }),
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
