"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCatalogProduct, productCreateInputFromBody } from "@/lib/imports";
import {
  createMargin,
  marginInputFromBody,
  recomputeListMultipliers,
  savePriceListParameters,
  updateMargin,
} from "@/lib/pricing";
import { PRODUCTS_CREATE_PERMISSION, requireAdminApiSession, requireApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";
import { getProduct, productUpdateInputFromBody, updateProduct } from "@/lib/catalog-management";
import { uuidParam } from "@/lib/request-body";

function boolField(formData: FormData, name: string) {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

export async function savePriceListAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const idRaw = String(formData.get("id") ?? "").trim();
  const parentRaw = String(formData.get("parentListId") ?? "").trim();
  const percentage = Number(formData.get("percentage") ?? 0);
  const floorRaw = String(formData.get("floorFactor") ?? "").trim();
  await savePriceListParameters(session.companyId, {
    id: idRaw ? Number(idRaw) : null,
    name: String(formData.get("name") ?? ""),
    derivationType: formData.get("derivationType") === "lista" ? "lista" : "costo",
    parentListId: parentRaw ? Number(parentRaw) : null,
    percentage: Number.isFinite(percentage) ? percentage : 0,
    allowedRoles: formData.getAll("roles").map(String).filter(Boolean),
    validFrom: String(formData.get("validFrom") ?? "").trim() || null,
    validTo: String(formData.get("validTo") ?? "").trim() || null,
    requiresAuthorization: boolField(formData, "requiresAuthorization"),
    admitsOffers: boolField(formData, "admitsOffers"),
    floorFactor: floorRaw ? Number(floorRaw) : null,
  });
  revalidatePath("/prices/parameters");
  revalidatePath("/prices");
  redirect("/prices/parameters?saved=1");
}

export async function createMarginAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await createMargin(session.companyId, marginInputFromBody(stringFieldsFromFormData(formData)));
  await recomputeListMultipliers(session.companyId);
  revalidatePath("/prices/margins");
  revalidatePath("/prices");
  redirect("/prices/margins?created=1");
}

export async function updateMarginAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const body = stringFieldsFromFormData(formData);
  const code = String(body.code ?? body.codigo ?? "");
  await updateMargin(session.companyId, code, marginInputFromBody(body, true));
  await recomputeListMultipliers(session.companyId);
  revalidatePath("/prices/margins");
  revalidatePath("/prices");
  redirect("/prices/margins?updated=1");
}

export async function createPriceProductAction(formData: FormData) {
  const session = await requireApiSession([PRODUCTS_CREATE_PERMISSION]);
  await createCatalogProduct(session, productCreateInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/prices");
  revalidatePath("/products");
  redirect("/prices/new?created=1");
}

export async function updatePriceProductAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "productos", action: "editar" }]);
  const productId = uuidParam(String(formData.get("productId") ?? ""), "Producto");
  const current = await getProduct(session.companyId, productId);
  await updateProduct(session, productId, productUpdateInputFromBody(stringFieldsFromFormData(formData), current));
  revalidatePath("/prices");
  revalidatePath("/products");
  redirect(`/prices?updated=${productId}`);
}
