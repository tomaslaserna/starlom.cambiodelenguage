"use server";

import { revalidatePath } from "next/cache";
import { approveCollection, rejectCollection, rejectionReasonFromBody } from "@/lib/collections";
import {
  COLLECTION_APPROVAL_PERMISSION,
  parseApprovalSource,
  resolveGenericApproval,
} from "@/lib/approvals";
import { positiveId, uuidParam } from "@/lib/request-body";
import { requireApiSession, requireSessionPermission } from "@/lib/route-auth";

function assertNeverApprovalSource(source: never): never {
  throw new Error(`Approval source no soportado: ${String(source)}`);
}

function revalidateCollectionFlow() {
  revalidatePath("/admin/approvals");
  revalidatePath("/collections");
  revalidatePath("/orders");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
}

export async function approveApprovalAction(formData: FormData) {
  const session = await requireApiSession();
  const source = parseApprovalSource(formData.get("source"));
  const rawId = String(formData.get("id") ?? "");

  switch (source) {
    case "collection":
      await requireSessionPermission(session, [COLLECTION_APPROVAL_PERMISSION]);
      await approveCollection(session, uuidParam(rawId, "Cobro"));
      revalidateCollectionFlow();
      return;
    case "request": {
      const id = positiveId(rawId, "Solicitud");
      await resolveGenericApproval(session, id, "aprobada");
      revalidatePath("/admin/approvals");
      return;
    }
    default:
      assertNeverApprovalSource(source);
  }
}

export async function rejectApprovalAction(formData: FormData) {
  const session = await requireApiSession();
  const source = parseApprovalSource(formData.get("source"));
  const rawId = String(formData.get("id") ?? "");
  const reason = rejectionReasonFromBody({ reason: String(formData.get("reason") ?? "") });

  switch (source) {
    case "collection":
      await requireSessionPermission(session, [COLLECTION_APPROVAL_PERMISSION]);
      await rejectCollection(session, uuidParam(rawId, "Cobro"), reason);
      revalidateCollectionFlow();
      return;
    case "request": {
      const id = positiveId(rawId, "Solicitud");
      await resolveGenericApproval(session, id, "rechazada", reason);
      revalidatePath("/admin/approvals");
      return;
    }
    default:
      assertNeverApprovalSource(source);
  }
}
