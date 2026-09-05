import { type NextRequest } from "next/server";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { importVerifiedProductImage } from "@/lib/product-image-store";
import { verifiedProductImageSource } from "@/lib/product-image-sources";
import { readRequestBody } from "@/lib/request-body";
import { PRODUCTS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([PRODUCTS_CREATE_PERMISSION]);
    const body = await readRequestBody(request, 8 * 1024);
    const productId = String(body.productId ?? "");
    const source = verifiedProductImageSource(productId);
    if (!source) throw new ApiError(404, "No hay una fuente verificada para este producto");
    const data = await importVerifiedProductImage(session, {
      productId: source.productId,
      sourceUrl: source.sourceUrl,
    });
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
