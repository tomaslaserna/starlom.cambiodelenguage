import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { listOrders } from "@/lib/orders";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const searchParams = request.nextUrl.searchParams;
    const result = await listOrders({
      companyId: companyIdFromRequest(request),
      query: searchParams.get("q"),
      status: searchParams.get("status"),
      collectionStatus: searchParams.get("collectionStatus"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}

