import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { createStockProduct, productCreateInputFromBody } from "@/lib/imports";
import {
  imageFileFromFormData,
  stringFieldsFromFormData,
  uploadImageFile,
} from "@/lib/storage";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([
      { resource: "productos", action: "crear" },
      { resource: "stock", action: "editar" },
    ]);
    const formData = await request.formData();
    const body = stringFieldsFromFormData(formData);
    const image = imageFileFromFormData(formData, ["foto", "file", "imageFile"]);

    if (image) {
      const uploaded = await uploadImageFile({
        file: image,
        folder: "productos",
        namePrefix: `producto_${session.companyId}`,
      });
      body.image = uploaded.url;
      body.imagen = uploaded.url;
    }

    const data = await createStockProduct(session, productCreateInputFromBody(body));
    return ok({ data: { ...data, image: String(body.image ?? "") } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
