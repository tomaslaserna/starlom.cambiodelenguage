"use server";

import { revalidatePath } from "next/cache";
import { resolvePriceListFollowup, snoozePriceListFollowup } from "@/lib/price-list-followups";
import { requireApiSession } from "@/lib/route-auth";

export async function resolvePriceListFollowupAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "crm", action: "ver" }]);
  await resolvePriceListFollowup(session, String(formData.get("signalId") ?? ""));
  revalidatePath("/sales-engine");
}

export async function snoozePriceListFollowupAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "crm", action: "ver" }]);
  await snoozePriceListFollowup(
    session,
    String(formData.get("signalId") ?? ""),
    Number(formData.get("days") ?? 7),
  );
  revalidatePath("/sales-engine");
}
