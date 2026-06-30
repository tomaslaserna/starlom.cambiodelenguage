import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import {
  createSalesNote,
  getSalesDocumentContext,
  salesNoteInputFromBody,
} from "@/lib/sales-documents";
import { readRequestBody, uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "ver" }]);
    const searchParams = request.nextUrl.searchParams;
    const rawSaleId = searchParams.get("saleId") ?? searchParams.get("id_venta") ?? "";
    const rawRemittanceId = searchParams.get("remittanceId") ?? searchParams.get("id_remito") ?? "";
    const data = await getSalesDocumentContext(
      session.companyId,
      rawSaleId ? uuidParam(rawSaleId, "Venta") : "",
      rawRemittanceId ? uuidParam(rawRemittanceId, "Remito") : "",
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "crear" }]);
    const body = await readRequestBody(request);
    const data = await createSalesNote(session, salesNoteInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
