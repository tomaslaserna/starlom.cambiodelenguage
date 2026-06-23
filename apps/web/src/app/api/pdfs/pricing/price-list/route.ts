import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { buildPriceListPdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "productos", action: "ver" }]);
    const list = Number(request.nextUrl.searchParams.get("list") ?? request.nextUrl.searchParams.get("lista") ?? 0);
    const file = await buildPriceListPdf(session.companyId, Number.isInteger(list) ? list : 0);
    return pdfResponse(file, request.nextUrl.searchParams.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
