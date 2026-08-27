import { NextResponse, type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { listPurchaseFormProducts } from "@/lib/purchases";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "ver" }]);
    const supplierId = request.nextUrl.searchParams.get("catalog") === "all"
      ? undefined
      : uuidParam(request.nextUrl.searchParams.get("supplierId") ?? undefined, "Proveedor");
    const products = await listPurchaseFormProducts(session.companyId, supplierId);
    return NextResponse.json({ ok: true, data: products });
  } catch (error) {
    return handleApiError(error);
  }
}
