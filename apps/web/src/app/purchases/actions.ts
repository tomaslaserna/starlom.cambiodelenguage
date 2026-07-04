"use server";

import { revalidatePath } from "next/cache";
import {
  assertPurchaseReceiptUploadAllowed,
  createPurchase,
  packageReviewFromBody,
  purchaseInputFromBody,
  purchaseIdFromParam,
  reviewPurchasePackage,
  updatePurchaseReceiptPhoto,
  updatePurchaseStatus,
} from "@/lib/purchases";
import { imageFileFromFormData, uploadImageFile } from "@/lib/storage";
import { ApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";

export async function createPurchaseAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "compras", action: "crear" }]);
  await createPurchase(
    session,
    purchaseInputFromBody({
      supplierId: formData.get("supplierId"),
      description: formData.get("description"),
      total: formData.get("total"),
      date: formData.get("date"),
      items:
        formData.get("productId") && formData.get("quantity")
          ? [{ productId: formData.get("productId"), quantity: formData.get("quantity") }]
          : [],
    }),
  );
  revalidatePath("/purchases");
}

export async function updatePurchaseStatusAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "compras", action: "editar" }]);
  const id = purchaseIdFromParam(String(formData.get("id") ?? ""), "Compra");
  const status = String(formData.get("status") ?? "").trim();
  if (!status) throw new ApiError(400, "Estado invalido");
  await updatePurchaseStatus(session.companyId, id, status);
  revalidatePath("/purchases");
}

export async function reviewPurchasePackageAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "compras", action: "editar" }]);
  const id = purchaseIdFromParam(String(formData.get("id") ?? ""), "Compra");
  const productIds = formData.getAll("itemProductId").map(String);
  const quantities = formData.getAll("itemQuantity").map(String);
  const arrivedItems = productIds.map((productId, index) => ({
    productId,
    quantity: quantities[index] ?? "0",
  }));
  await reviewPurchasePackage(
    session,
    id,
    packageReviewFromBody({
      action: formData.get("action"),
      failure: formData.get("failure"),
      arrivedItems,
    }),
  );
  revalidatePath("/purchases");
}

export async function uploadPurchaseReceiptAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "compras", action: "editar" }]);
  const id = purchaseIdFromParam(String(formData.get("id") ?? ""), "Compra");
  await assertPurchaseReceiptUploadAllowed(session.companyId, id);
  const image = imageFileFromFormData(formData, ["foto", "file", "receipt"]);
  if (!image) throw new ApiError(400, "No se recibio ninguna imagen");
  const uploaded = await uploadImageFile({
    file: image,
    folder: "recibos",
    namePrefix: `recibo_${session.companyId}_${id}`,
  });
  await updatePurchaseReceiptPhoto(session, id, uploaded.url);
  revalidatePath("/purchases");
}
