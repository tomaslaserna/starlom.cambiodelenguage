"use server";

import { revalidatePath } from "next/cache";
import { approveCollection, rejectCollection, rejectionReasonFromBody } from "@/lib/collections";
import {
  COLLECTION_APPROVAL_PERMISSION,
  parseApprovalSource,
  resolveGenericApproval,
} from "@/lib/approvals";
import { positiveId } from "@/lib/request-body";
import { requireApiSession, requireSessionPermission } from "@/lib/route-auth";

function assertNeverApprovalSource(source: never): never {
  throw new Error(`Approval source no soportado: ${String(source)}`);
}

export async function approveApprovalAction(formData: FormData) {
  const session = await requireApiSession();
  const source = parseApprovalSource(formData.get("source"));
  const id = positiveId(String(formData.get("id") ?? ""), "Solicitud");

  switch (source) {
    case "collection":
      await requireSessionPermission(session, [COLLECTION_APPROVAL_PERMISSION]);
      await approveCollection(session, id);
      revalidatePath("/admin/approvals");
      revalidatePath("/collections");
      return;
    case "request":
      await resolveGenericApproval(session, id, "aprobada");
      revalidatePath("/admin/approvals");
      return;
    default:
      assertNeverApprovalSource(source);
  }
}

export async function rejectApprovalAction(formData: FormData) {
  const session = await requireApiSession();
  const source = parseApprovalSource(formData.get("source"));
  const id = positiveId(String(formData.get("id") ?? ""), "Solicitud");
  const reason = rejectionReasonFromBody({ reason: String(formData.get("reason") ?? "") });

  switch (source) {
    case "collection":
      await requireSessionPermission(session, [COLLECTION_APPROVAL_PERMISSION]);
      await rejectCollection(session, id, reason);
      revalidatePath("/admin/approvals");
      revalidatePath("/collections");
      return;
    case "request":
      await resolveGenericApproval(session, id, "rechazada", reason);
      revalidatePath("/admin/approvals");
      return;
    default:
      assertNeverApprovalSource(source);
  }
}
