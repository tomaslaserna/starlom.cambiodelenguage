"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { deleteSale } from "@/lib/sales-admin";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";
import { requestSaleFiscalNote } from "@/lib/fiscal";

export async function requestFiscalNoteAction(formData: FormData) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "ver" }]);
    const saleId = uuidParam(String(formData.get("saleId") ?? ""), "Venta");
    const documentId = uuidParam(String(formData.get("documentId") ?? ""), "Nota operativa");
    await requestSaleFiscalNote(session, saleId, documentId);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    redirect(`/sales?error=1&message=${encodeURIComponent(error.message.slice(0, 500))}`);
  }
  revalidatePath("/sales");
  revalidatePath("/admin/approvals");
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
