"use server";

import { revalidatePath } from "next/cache";
import { updateSalesAdminRecord } from "@/lib/sales-admin";
import { uuidParam } from "@/lib/request-body";
import { stringFieldsFromFormData } from "@/lib/storage";
import { requireApiSession } from "@/lib/route-auth";

function revalidateSalesFlow() {
  revalidatePath("/sales");
  revalidatePath("/orders");
  revalidatePath("/collections");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
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
