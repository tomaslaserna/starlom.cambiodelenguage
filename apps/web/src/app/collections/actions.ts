"use server";

import { revalidatePath } from "next/cache";
import { collectionRegistrationFromBody, registerCollection } from "@/lib/collections";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

function revalidateCollectionFlow() {
  revalidatePath("/collections");
  revalidatePath("/admin/approvals");
  revalidatePath("/orders");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
}

export async function registerCollectionAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
  await registerCollection(
    session,
    id,
    collectionRegistrationFromBody(Object.fromEntries(formData.entries())),
  );
  revalidateCollectionFlow();
}
