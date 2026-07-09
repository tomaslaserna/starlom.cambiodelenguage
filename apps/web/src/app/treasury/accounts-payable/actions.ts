"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOperatingCost, operatingCostInputFromBody } from "@/lib/profitability";
import { purchaseIdFromParam, requestSupplierPaymentApproval, supplierPaymentFromBody } from "@/lib/purchases";
import { stringFieldsFromFormData } from "@/lib/storage";
import { requireAdminApiSession, requireApiSession } from "@/lib/route-auth";

export async function createManualPayableAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const body = stringFieldsFromFormData(formData);
  await createOperatingCost(
    session.companyId,
    operatingCostInputFromBody({
      concept: body.concept,
      amount: body.amount,
      date: body.date,
      category: "cuenta_por_pagar",
    }),
  );
  revalidatePath("/treasury/accounts-payable");
  revalidatePath("/treasury/cash-flow");
  redirect("/treasury/accounts-payable?created=1");
}

export async function programSupplierPaymentAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "compras", action: "editar" }]);
  const id = purchaseIdFromParam(String(formData.get("id") ?? ""), "Compra");
  await requestSupplierPaymentApproval(
    session,
    id,
    supplierPaymentFromBody({
      amount: formData.get("amount"),
      date: formData.get("date"),
      notes: formData.get("notes") || "Programado desde cuentas por pagar",
    }),
  );
  revalidatePath("/treasury/accounts-payable");
  revalidatePath("/treasury/cash-flow");
  revalidatePath("/admin/approvals");
  redirect("/treasury/accounts-payable?scheduled=1");
}
