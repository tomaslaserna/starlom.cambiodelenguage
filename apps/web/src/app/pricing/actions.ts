"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createMargin,
  createPriceList,
  marginInputFromBody,
  multiplierInputFromBody,
  priceListInputFromBody,
  rubricInputFromBody,
  updatePriceListMultiplier,
  upsertRubric,
} from "@/lib/pricing";
import { requireAdminApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

export async function createMarginAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await createMargin(session.companyId, marginInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/pricing");
  redirect("/pricing?created=margin");
}

export async function createPriceListAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await createPriceList(session.companyId, priceListInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/pricing");
  redirect("/pricing?created=list");
}

export async function upsertRubricAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await upsertRubric(session.companyId, rubricInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/pricing");
  redirect("/pricing?created=rubric");
}

export async function updateMultiplierAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await updatePriceListMultiplier(session.companyId, multiplierInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/pricing");
  redirect("/pricing?updated=multiplier");
}
