"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { deleteSale, updateSalesAdminRecord } from "@/lib/sales-admin";
import { uuidParam } from "@/lib/request-body";
import { stringFieldsFromFormData } from "@/lib/storage";
import { requireApiSession } from "@/lib/route-auth";

function revalidateSalesFlow() {
  for (const path of [
    "/sales",
    "/orders",
    "/orders/new",
    "/collections",
    "/stock",
    "/products",
    "/treasury/current-accounts",
    "/metrics",
    "/balance",
  ]) {
    revalidatePath(path);
  }
}

export async function editSaleAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "ventas", action: "editar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
  await updateSalesAdminRecord(session, id, stringFieldsFromFormData(formData));
  revalidateSalesFlow();
}

export async function cancelSaleAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "ventas", action: "editar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
  await updateSalesAdminRecord(session, id, { estado_pedido: "cancelado" });
  revalidateSalesFlow();
}

export async function deleteSaleAction(formData: FormData) {
  try {
    const session = await requireApiSession();
    const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
    await deleteSale(session, id);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const message = encodeURIComponent(error.message.slice(0, 500));
    redirect(`/sales?error=1&message=${message}`);
  }
  revalidateSalesFlow();
}
