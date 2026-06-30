"use server";

import { revalidatePath } from "next/cache";
import { collectionRegistrationFromBody, registerCollection } from "@/lib/collections";
import { orderConfirmationDocumentFromBody, orderStatusFromBody, updateOrderStatus } from "@/lib/orders";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

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

export async function registerOrderCollectionAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Pedido");
  await registerCollection(
    session,
    id,
    collectionRegistrationFromBody(Object.fromEntries(formData.entries())),
  );
  revalidatePath("/orders");
  revalidatePath("/collections");
  revalidatePath("/admin/approvals");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
}
