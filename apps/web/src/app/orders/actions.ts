"use server";

import { revalidatePath } from "next/cache";
import { orderConfirmationDocumentFromBody, orderStatusFromBody, updateOrderStatus } from "@/lib/orders";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export async function updateOrderStatusAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "pedidos", action: "editar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Pedido");
  const body = Object.fromEntries(formData.entries());
  const status = orderStatusFromBody(body);
  await updateOrderStatus(session, id, status, {
    confirmationDocument: orderConfirmationDocumentFromBody(body),
  });
  revalidatePath("/orders");
}
