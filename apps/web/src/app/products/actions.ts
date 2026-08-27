"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCatalogProduct,
  importProductCodesFromCsv,
  importProductsFromCsv,
  productCreateInputFromBody,
} from "@/lib/imports";
import { PRODUCTS_CREATE_PERMISSION, requireAdminApiSession, requireApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";
import { updateProductPresentation } from "@/lib/catalog";
import { ApiError } from "@/lib/api-response";
import { uuidParam } from "@/lib/request-body";

export async function createProductAction(formData: FormData) {
  const session = await requireApiSession([PRODUCTS_CREATE_PERMISSION]);
  const body = stringFieldsFromFormData(formData);

  await createCatalogProduct(session, productCreateInputFromBody(body));
  revalidatePath("/pricing");
  revalidatePath("/products");
  redirect("/pricing?mode=new-product&created=1");
}

export async function updateProductPresentationAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "productos", action: "editar" }]);
  const productId = uuidParam(String(formData.get("productId") ?? ""), "producto");
  const presentationUnits = Math.trunc(Number(formData.get("presentationUnits")));
  if (!Number.isFinite(presentationUnits) || presentationUnits < 1 || presentationUnits > 9999) {
    throw new ApiError(400, "La presentacion debe tener entre 1 y 9999 unidades");
  }
  await updateProductPresentation(session.companyId, productId, presentationUnits);
  revalidatePath("/products");
  revalidatePath("/orders/new");
}

export async function importProductsCsvAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const request = new Request("https://starlim.local/import-products", {
    method: "POST",
    body: formData,
  });
  const result = await importProductsFromCsv(request, session.companyId);
  revalidatePath("/products");
  revalidatePath("/pricing");
  redirect(
    `/pricing?mode=bulk&processed=${result.processed}&inserted=${result.inserted ?? 0}&skipped=${result.skipped}`,
  );
}

export async function importProductCodesCsvAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const request = new Request("https://starlim.local/import-product-codes", {
    method: "POST",
    body: formData,
  });
  const result = await importProductCodesFromCsv(request, session.companyId);
  revalidatePath("/products");
  revalidatePath("/pricing");
  redirect(
    `/pricing?mode=bulk&processed=${result.processed}&updated=${result.updated ?? 0}&skipped=${result.skipped}`,
  );
}
