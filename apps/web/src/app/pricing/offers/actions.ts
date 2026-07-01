"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOffer, offerInputFromBody, setOfferActive, updateOffer } from "@/lib/offers";
import { uuidParam } from "@/lib/request-body";
import { requireAdminApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

export async function createOfferAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await createOffer(session.companyId, offerInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/pricing/offers");
  redirect("/pricing/offers?created=1");
}

export async function updateOfferAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const id = uuidParam(String(formData.get("id") ?? ""), "Oferta");
  await updateOffer(session.companyId, id, offerInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/pricing/offers");
  redirect("/pricing/offers?updated=1");
}

export async function toggleOfferActiveAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const id = uuidParam(String(formData.get("id") ?? ""), "Oferta");
  const active = String(formData.get("active") ?? "") !== "inactiva";
  await setOfferActive(session.companyId, id, active);
  revalidatePath("/pricing/offers");
  redirect("/pricing/offers");
}
