import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { removeProductImage, setProductImage } from "@/lib/product-image-store";
import { readRequestBody } from "@/lib/request-body";
import { PRODUCTS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([PRODUCTS_CREATE_PERMISSION]);
    const { id } = await context.params;
    const body = await readRequestBody(request, 4 * 1024);
    const data = await setProductImage(session, id, body.path);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([PRODUCTS_CREATE_PERMISSION]);
    const { id } = await context.params;
    await removeProductImage(session, id);
    return ok({ data: { ok: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
