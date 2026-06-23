"use server";

import { redirect } from "next/navigation";
import { basicOrderInputFromBody, createBasicOrder } from "@/lib/orders";
import { requireApiSession } from "@/lib/route-auth";

export async function createOrderAction(formData: FormData) {
  const session = await requireApiSession([
    { resource: "ventas", action: "crear" },
    { resource: "pedidos", action: "editar" },
  ]);
  await createBasicOrder(session, basicOrderInputFromBody(Object.fromEntries(formData.entries())));
  redirect("/orders?status=recibido");
}
