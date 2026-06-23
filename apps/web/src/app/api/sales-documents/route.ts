import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import {
  createSalesNote,
  getSalesDocumentContext,
  salesNoteInputFromBody,
} from "@/lib/sales-documents";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const searchParams = request.nextUrl.searchParams;
    const saleId = Number(searchParams.get("saleId") ?? searchParams.get("id_venta") ?? 0);
    const remittanceId = Number(
      searchParams.get("remittanceId") ?? searchParams.get("id_remito") ?? 0,
    );
    const data = await getSalesDocumentContext(
      companyIdFromRequest(request),
      Number.isInteger(saleId) ? saleId : 0,
      Number.isInteger(remittanceId) ? remittanceId : 0,
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

