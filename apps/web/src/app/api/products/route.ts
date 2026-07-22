import { NextResponse, type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { listProducts } from "@/lib/catalog";
import { createCatalogProduct, productCreateInputFromBody } from "@/lib/imports";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "productos", action: "ver" }]);
    const searchParams = request.nextUrl.searchParams;
    const result = await listProducts({
      companyId: session.companyId,
      query: searchParams.get("q"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });

    return NextResponse.json({ ok: true, ...result });
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
