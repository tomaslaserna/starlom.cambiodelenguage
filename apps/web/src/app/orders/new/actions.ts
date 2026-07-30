"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { basicOrderInputFromBody, createBasicOrder } from "@/lib/orders";
import { ORDERS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";
import type { OrderEntryActionState } from "@/app/orders/order-entry-action-state";

export async function createOrderAction(
  _previousState: OrderEntryActionState,
  formData: FormData,
): Promise<OrderEntryActionState> {
  try {
    const session = await requireApiSession([
      ORDERS_CREATE_PERMISSION,
      { resource: "pedidos", action: "editar" },
    ]);
    await createBasicOrder(session, basicOrderInputFromBody(Object.fromEntries(formData.entries())));
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { error: error.message.slice(0, 500) };
  }
  redirect("/orders?status=cargado");
}
