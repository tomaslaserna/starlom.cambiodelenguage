"use server";

import { revalidatePath } from "next/cache";
import { orderStatusFromBody, updateOrderStatus } from "@/lib/orders";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export async function updateOrderStatusAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "pedidos", action: "editar" }]);
  const id = positiveId(String(formData.get("id") ?? ""), "Pedido");
  const status = orderStatusFromBody({ status: String(formData.get("status") ?? "") });
  await updateOrderStatus(session, id, status);
  revalidatePath("/orders");
}
