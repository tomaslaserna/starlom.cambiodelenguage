import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { createStorefrontRequest, parseStorefrontRequest } from "@/lib/storefront";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 32 * 1024) throw new ApiError(413, "Solicitud demasiado grande");
    const result = await createStorefrontRequest(parseStorefrontRequest(await request.json()));
    return ok({ data: result }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
