"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { basicOrderInputFromBody, updateBasicOrder } from "@/lib/orders";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export async function updateLoadedOrderAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "pedidos", action: "editar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Pedido");
  await updateBasicOrder(session, id, basicOrderInputFromBody(Object.fromEntries(formData.entries())));
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}/edit`);
  redirect("/orders?status=cargado");
}
