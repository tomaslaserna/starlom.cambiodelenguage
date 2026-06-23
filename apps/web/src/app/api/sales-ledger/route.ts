import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { listSalesLedger } from "@/lib/sales-admin";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "ver" }]);
    const data = await listSalesLedger(session.companyId, request.nextUrl.searchParams);
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
