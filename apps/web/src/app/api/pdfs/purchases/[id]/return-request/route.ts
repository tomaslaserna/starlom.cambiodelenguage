import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { buildPurchaseReturnRequestPdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { purchaseIdFromParam } from "@/lib/purchases";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "ver" }]);
    const { id } = await context.params;
    const file = await buildPurchaseReturnRequestPdf(
      session.companyId,
      purchaseIdFromParam(id, "Compra"),
      request.nextUrl.searchParams.get("reason") ?? request.nextUrl.searchParams.get("motivo") ?? "",
    );
    return pdfResponse(file, request.nextUrl.searchParams.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
