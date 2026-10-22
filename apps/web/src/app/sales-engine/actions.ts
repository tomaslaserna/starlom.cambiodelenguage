"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";
import { completeSalesMission, type SalesMissionKind } from "@/lib/sales-missions";

const MISSION_KINDS = new Set<SalesMissionKind>(["lead", "cliente", "presupuesto", "lista"]);

export async function completeSalesMissionAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "crm", action: "ver" }]);
  if (formData.get("completed") !== "yes") throw new ApiError(400, "Marcá la misión como realizada");
  const kind = String(formData.get("kind") ?? "") as SalesMissionKind;
  if (!MISSION_KINDS.has(kind)) throw new ApiError(400, "Tipo de misión inválido");
  await completeSalesMission(session, {
    missionKey: String(formData.get("missionKey") ?? ""),
    kind,
    entityId: String(formData.get("entityId") ?? ""),
    nextFollowupOn: String(formData.get("nextFollowupOn") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath("/sales-engine");
}
