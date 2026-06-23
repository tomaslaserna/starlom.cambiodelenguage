import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { buildPurchaseOrderPdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "ver" }]);
    const { id } = await context.params;
    const file = await buildPurchaseOrderPdf(session.companyId, positiveId(id, "Compra"));
    return pdfResponse(file, request.nextUrl.searchParams.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
