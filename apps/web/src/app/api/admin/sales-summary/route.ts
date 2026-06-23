import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { getSalesSummary } from "@/lib/sales-admin";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "reportes", action: "ver" }]);
    const data = await getSalesSummary(session.companyId, request.nextUrl.searchParams.get("periodo"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
