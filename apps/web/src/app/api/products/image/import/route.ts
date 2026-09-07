import { type NextRequest } from "next/server";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import { importVerifiedProductImage } from "@/lib/product-image-store";
import { customProductImageSource, normalizeProductImageName, verifiedProductImageSource } from "@/lib/product-image-sources";
import { readRequestBody } from "@/lib/request-body";
import { PRODUCTS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([PRODUCTS_CREATE_PERMISSION]);
    const body = await readRequestBody(request, 8 * 1024);
    let productId = String(body.productId ?? "");
    const sourceKey = String(body.sourceKey ?? "");
    const customSource = sourceKey ? customProductImageSource(sourceKey) : null;
    if (customSource) {
      const products = await withCompanyContext(session.companyId, async (client) => {
        const result = await client.query<{ id: string; name: string }>(
          "SELECT id, name FROM products WHERE empresa_id = $1",
          [session.companyId],
        );
        return result.rows;
      });
      const expectedName = normalizeProductImageName(customSource.productName);
      const matches = products.filter((product) => normalizeProductImageName(product.name) === expectedName);
      if (matches.length !== 1) {
        throw new ApiError(409, matches.length ? "Hay más de un producto con ese nombre" : "No se encontró el producto por su nombre exacto");
      }
      productId = matches[0].id;
    }
    const source = customSource ? { ...customSource, productId } : verifiedProductImageSource(productId);
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
