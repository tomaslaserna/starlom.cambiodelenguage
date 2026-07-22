"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { basicOrderInputFromBody, createBasicOrder } from "@/lib/orders";
import { ORDERS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function createOrderAction(formData: FormData) {
  try {
    const session = await requireApiSession([
      ORDERS_CREATE_PERMISSION,
      { resource: "pedidos", action: "editar" },
    ]);
    await createBasicOrder(session, basicOrderInputFromBody(Object.fromEntries(formData.entries())));
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const message = encodeURIComponent(error.message.slice(0, 500));
    redirect(`/orders/new?status=error&message=${message}`);
  }
  redirect("/orders?status=cargado");
}
