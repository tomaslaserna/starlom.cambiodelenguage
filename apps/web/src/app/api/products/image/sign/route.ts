import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { prepareProductImageUpload } from "@/lib/product-image-store";
import { readRequestBody } from "@/lib/request-body";
import { PRODUCTS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([PRODUCTS_CREATE_PERMISSION]);
    const body = await readRequestBody(request, 16 * 1024);
    const data = await prepareProductImageUpload(session, body);
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
