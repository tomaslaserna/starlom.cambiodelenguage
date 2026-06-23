import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { listProducts } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  const searchParams = request.nextUrl.searchParams;
  const result = await listProducts({
    companyId: companyIdFromRequest(request),
    query: searchParams.get("q"),
    page: searchParams.get("page"),
    pageSize: searchParams.get("pageSize"),
  });

  return NextResponse.json({ ok: true, ...result });
}
