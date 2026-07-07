"use server";

import { redirect } from "next/navigation";
import { basicOrderInputFromBody, createBasicOrder } from "@/lib/orders";
import { ORDERS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function createOrderAction(formData: FormData) {
  const session = await requireApiSession([
    ORDERS_CREATE_PERMISSION,
    { resource: "pedidos", action: "editar" },
  ]);
  await createBasicOrder(session, basicOrderInputFromBody(Object.fromEntries(formData.entries())));
  redirect("/orders?status=cargado");
}
