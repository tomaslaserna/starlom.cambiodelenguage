import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { createStockProduct, productCreateInputFromBody } from "@/lib/imports";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([
      { resource: "productos", action: "crear" },
      { resource: "stock", action: "editar" },
    ]);
    const body = await readRequestBody(request);
    const data = await createStockProduct(session, productCreateInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
