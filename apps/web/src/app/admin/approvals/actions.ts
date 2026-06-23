"use server";

import { revalidatePath } from "next/cache";
import { approveCollection, rejectCollection, rejectionReasonFromBody } from "@/lib/collections";
import { resolveGenericApproval } from "@/lib/approvals";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export async function approveApprovalAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "cobranzas", action: "aprobar" }]);
  const id = positiveId(String(formData.get("id") ?? ""), "Solicitud");
  const source = String(formData.get("source") ?? "");

  if (source === "collection") {
    await approveCollection(session, id);
  } else {
    await resolveGenericApproval(session, id, "aprobada");
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/collections");
}

export async function rejectApprovalAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "cobranzas", action: "aprobar" }]);
  const id = positiveId(String(formData.get("id") ?? ""), "Solicitud");
  const source = String(formData.get("source") ?? "");
  const reason = rejectionReasonFromBody({ reason: String(formData.get("reason") ?? "") });

  if (source === "collection") {
    await rejectCollection(session, id, reason);
  } else {
    await resolveGenericApproval(session, id, "rechazada", reason);
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/collections");
}
