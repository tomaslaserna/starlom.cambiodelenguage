import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { getCustomerStatement } from "@/lib/customer-accounts";
import { buildCustomerStatementPdf } from "@/lib/pdf/customer-statement";
import { pdfResponse } from "@/lib/pdf/renderer";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiSession([COLLECTIONS_READ_PERMISSION]);
    const clientId = uuidParam((await context.params).id, "Cliente");
    const search = request.nextUrl.searchParams;
    const result = await getCustomerStatement(session.companyId, clientId, { from: search.get("from") ?? "", to: search.get("to") ?? "" });
    return pdfResponse(await buildCustomerStatementPdf(result, search), search.get("download") !== "1");
  } catch (error) { return handleApiError(error); }
}
