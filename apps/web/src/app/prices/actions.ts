"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCatalogProduct, productCreateInputFromBody } from "@/lib/imports";
import {
  createMargin,
  createPriceList,
  marginInputFromBody,
  priceListInputFromBody,
  updateMargin,
} from "@/lib/pricing";
import { PRODUCTS_CREATE_PERMISSION, requireAdminApiSession, requireApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

export async function createPriceListAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const list = await createPriceList(session.companyId, priceListInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/prices");
  redirect(`/prices?list=${list.id}`);
}

export async function createMarginAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await createMargin(session.companyId, marginInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/prices/margins");
  redirect("/prices/margins?created=1");
}

export async function updateMarginAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const body = stringFieldsFromFormData(formData);
  const code = String(body.code ?? body.codigo ?? "");
  await updateMargin(session.companyId, code, marginInputFromBody(body, true));
  revalidatePath("/prices/margins");
  redirect("/prices/margins?updated=1");
}

export async function createPriceProductAction(formData: FormData) {
  const session = await requireApiSession([PRODUCTS_CREATE_PERMISSION]);
  await createCatalogProduct(session, productCreateInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/prices");
  revalidatePath("/products");
  redirect("/prices/new?created=1");
}
