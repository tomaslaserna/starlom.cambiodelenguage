"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { basicOrderInputFromBody, updateBasicOrder } from "@/lib/orders";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";
import type { OrderEntryActionState } from "@/app/orders/order-entry-action-state";

export async function updateLoadedOrderAction(
  _previousState: OrderEntryActionState,
  formData: FormData,
): Promise<OrderEntryActionState> {
  const rawId = String(formData.get("id") ?? "");
  let id = "";
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "editar" }]);
    id = uuidParam(rawId, "Pedido");
    await updateBasicOrder(session, id, basicOrderInputFromBody(Object.fromEntries(formData.entries())));
    revalidatePath("/orders");
    revalidatePath(`/orders/${id}/edit`);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { error: error.message.slice(0, 500) };
  }
  redirect("/orders?status=cargado");
}
