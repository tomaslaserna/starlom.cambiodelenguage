import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { createCatalogProduct, productCreateInputFromBody } from "@/lib/imports";
import { listInventoryProducts } from "@/lib/inventory";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "productos", action: "ver" }]);
    const data = await listInventoryProducts(session.companyId, request.nextUrl.searchParams.get("q") ?? "");
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "productos", action: "crear" }]);
    const body = await readRequestBody(request);
    const data = await createCatalogProduct(session, productCreateInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
