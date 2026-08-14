"use server";

import { revalidatePath } from "next/cache";
import { collectionRegistrationFromBody, registerCollection } from "@/lib/collections";
import { assertVendorOwnsSale } from "@/lib/crm";
import { uuidParam } from "@/lib/request-body";
import { CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function registerCrmCollectionAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
  await assertVendorOwnsSale(session, id);
  await registerCollection(
    session,
    id,
    collectionRegistrationFromBody(Object.fromEntries(formData.entries())),
  );
  revalidatePath("/crm/cobros");
  revalidatePath("/admin/approvals");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
}
