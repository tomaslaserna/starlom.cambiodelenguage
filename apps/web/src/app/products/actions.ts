"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import {
  bulkUpdateProducts,
  createStockProduct,
  importProductCodesFromCsv,
  importProductsFromCsv,
  productBulkUpdateInputFromBody,
  productCreateInputFromBody,
} from "@/lib/imports";
import { requireAdminApiSession, requireApiSession } from "@/lib/route-auth";
import {
  imageFileFromFormData,
  stringFieldsFromFormData,
  uploadImageFile,
} from "@/lib/storage";

export async function createProductAction(formData: FormData) {
  const session = await requireApiSession([
    { resource: "productos", action: "crear" },
    { resource: "stock", action: "editar" },
  ]);
  const body = stringFieldsFromFormData(formData);
  const image = imageFileFromFormData(formData, ["imageFile", "image", "foto"]);

  if (image) {
    const uploaded = await uploadImageFile({
      file: image,
      folder: "productos",
      namePrefix: `producto_${session.companyId}`,
    });
    body.image = uploaded.url;
    body.imagen = uploaded.url;
  }

  await createStockProduct(session, productCreateInputFromBody(body));
  revalidatePath("/products");
  redirect("/products?mode=new&created=1");
}

export async function bulkUpdateProductsAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "stock", action: "editar" }]);
  const raw = String(formData.get("itemsJson") ?? "").trim();
  if (!raw) throw new ApiError(400, "Pegá un JSON con productos para actualizar");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "JSON invalido");
  }

  if (!Array.isArray(parsed)) throw new ApiError(400, "El JSON debe ser un array");
  const result = await bulkUpdateProducts(session, productBulkUpdateInputFromBody({ items: parsed }));
  revalidatePath("/products");
  redirect(`/products?mode=bulk&updated=${result.updated}`);
}

export async function importProductsCsvAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const request = new Request("https://starlim.local/import-products", {
    method: "POST",
    body: formData,
  });
  const result = await importProductsFromCsv(request, session.companyId);
  revalidatePath("/products");
  redirect(
    `/products?mode=bulk&processed=${result.processed}&inserted=${result.inserted ?? 0}&skipped=${result.skipped}`,
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
  redirect(
    `/products?mode=bulk&processed=${result.processed}&updated=${result.updated ?? 0}&skipped=${result.skipped}`,
  );
}
