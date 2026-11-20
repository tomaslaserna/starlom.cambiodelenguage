import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import {
  deleteSupplier,
  getSupplier,
  supplierInputFromBody,
  updateSupplier,
} from "@/lib/catalog-management";
import { readRequestBody, uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "proveedores", action: "ver" }]);
    const { id } = await context.params;
    const data = await getSupplier(session.companyId, uuidParam(id, "Proveedor"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "proveedores", action: "editar" }]);
    const { id } = await context.params;
    const supplierId = uuidParam(id, "Proveedor");
    const body = await readRequestBody(request);
    const current = await getSupplier(session.companyId, supplierId);
    const data = await updateSupplier(
      session,
      supplierId,
      supplierInputFromBody(body, {
        name: current.name,
        legalName: current.legalName,
        contactName: current.contactName,
        taxId: current.taxId,
        fiscalCondition: current.fiscalCondition,
        rubric: current.rubric,
        phone: current.phone,
        email: current.email,
        address: current.address,
        locality: current.locality,
        province: current.province,
        notes: current.notes,
        paymentTermDays: current.paymentTermDays,
        deliveryLeadDays: current.deliveryLeadDays,
        minimumOrderAmount: current.minimumOrderAmount,
        shippingMethod: current.shippingMethod,
        bankName: current.bankName,
        bankAccountType: current.bankAccountType,
        bankAccountHolder: current.bankAccountHolder,
        bankAccountIdentifier: current.bankAccountIdentifier,
        bankAlias: current.bankAlias,
      }),
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "proveedores", action: "eliminar" }]);
    const { id } = await context.params;
    const data = await deleteSupplier(session.companyId, uuidParam(id, "Proveedor"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
