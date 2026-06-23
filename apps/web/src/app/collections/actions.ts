"use server";

import { revalidatePath } from "next/cache";
import { approveCollection, rejectCollection, rejectionReasonFromBody } from "@/lib/collections";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export async function approveCollectionAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "cobranzas", action: "aprobar" }]);
  const id = positiveId(String(formData.get("id") ?? ""), "Cobro");
  await approveCollection(session, id);
  revalidatePath("/collections");
}

export async function rejectCollectionAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "cobranzas", action: "aprobar" }]);
  const id = positiveId(String(formData.get("id") ?? ""), "Cobro");
  const reason = rejectionReasonFromBody({ reason: String(formData.get("reason") ?? "") });
  await rejectCollection(session, id, reason);
  revalidatePath("/collections");
}
