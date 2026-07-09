import { type NextRequest } from "next/server";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import {
  assertPurchaseReceiptUploadAllowed,
  purchaseIdFromParam,
  updatePurchaseReceiptPhoto,
} from "@/lib/purchases";
import { imageFileFromFormData, uploadImageFile } from "@/lib/storage";
import { requireApiSession } from "@/lib/route-auth";
import { assertRequestSize } from "@/lib/request-body";

export const runtime = "nodejs";
const RECEIPT_UPLOAD_BODY_LIMIT_BYTES = 9 * 1024 * 1024;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "editar" }]);
    const { id } = await context.params;
    const purchaseId = purchaseIdFromParam(id, "Compra");
    await assertPurchaseReceiptUploadAllowed(session.companyId, purchaseId);

    assertRequestSize(request, RECEIPT_UPLOAD_BODY_LIMIT_BYTES, "La imagen");
    const formData = await request.formData();
    const image = imageFileFromFormData(formData, ["foto", "file", "receipt"]);
    if (!image) throw new ApiError(400, "No se recibio ninguna imagen");

    const uploaded = await uploadImageFile({
      file: image,
      folder: "recibos",
      namePrefix: `recibo_${session.companyId}_${purchaseId}`,
    });
    const data = await updatePurchaseReceiptPhoto(session, purchaseId, uploaded.url);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
