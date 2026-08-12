"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { requestSaleFiscalInvoice } from "@/lib/fiscal";
import { orderStatusFromBody, updateOrderStatus } from "@/lib/orders";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";
import { deleteSale } from "@/lib/sales-admin";

function revalidateOrderFlow() {
  for (const path of [
    "/orders",
    "/orders/new",
    "/sales",
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

export async function updateOrderStatusAction(formData: FormData) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "editar" }]);
    const id = uuidParam(String(formData.get("id") ?? ""), "Pedido");
    const body = Object.fromEntries(formData.entries());
    const status = orderStatusFromBody(body);
    await updateOrderStatus(session, id, status);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const message = encodeURIComponent(error.message.slice(0, 500));
    redirect(`/orders?error=1&message=${message}`);
  }
  revalidateOrderFlow();
}

export async function requestFiscalInvoiceAction(formData: FormData) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "ver" }]);
    const id = uuidParam(String(formData.get("id") ?? ""), "Pedido");
    await requestSaleFiscalInvoice(session, id);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const message = encodeURIComponent(error.message.slice(0, 500));
    redirect(`/orders?error=1&message=${message}`);
  }
  revalidatePath("/orders");
  revalidatePath("/admin/approvals");
}

export async function deleteOrderAction(formData: FormData) {
  try {
    const session = await requireApiSession();
    const id = uuidParam(String(formData.get("id") ?? ""), "Pedido");
    await deleteSale(session, id);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const message = encodeURIComponent(error.message.slice(0, 500));
    redirect(`/orders?error=1&message=${message}`);
  }
  revalidateOrderFlow();
}
