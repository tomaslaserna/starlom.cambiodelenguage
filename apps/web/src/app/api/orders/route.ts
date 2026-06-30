import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { listOrders } from "@/lib/orders";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "ver" }]);
    const searchParams = request.nextUrl.searchParams;
    const result = await listOrders({
      companyId: session.companyId,
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
