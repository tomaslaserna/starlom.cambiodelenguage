"use server";

import { revalidatePath } from "next/cache";
import { approveCollection, rejectCollection, rejectionReasonFromBody } from "@/lib/collections";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

function revalidateCollectionFlow() {
  revalidatePath("/collections");
  revalidatePath("/admin/approvals");
  revalidatePath("/orders");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
}

export async function approveCollectionAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "cobranzas", action: "aprobar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cobro");
  await approveCollection(session, id);
  revalidateCollectionFlow();
}

export async function rejectCollectionAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "cobranzas", action: "aprobar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cobro");
  const reason = rejectionReasonFromBody({ reason: String(formData.get("reason") ?? "") });
  await rejectCollection(session, id, reason);
  revalidateCollectionFlow();
}
