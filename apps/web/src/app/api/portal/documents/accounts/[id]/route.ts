import { handleApiError } from "@/lib/api-response";
import { getCustomerStatement } from "@/lib/customer-accounts";
import { requirePortalStatementAccess } from "@/lib/portal-statement-access";
import { buildCustomerStatementPdf } from "@/lib/pdf/customer-statement";
import { pdfResponse } from "@/lib/pdf/renderer";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { companyId, clientId } = await requirePortalStatementAccess(request, (await context.params).id);
    const result = await getCustomerStatement(companyId, clientId, {});
    // Portal supports current/full views only, never accepts a different company/client from URL queries.
    const search = new URLSearchParams();
    if (new URL(request.url).searchParams.get("history") === "completo") search.set("history", "completo");
    return pdfResponse(await buildCustomerStatementPdf(result, search), false);
  } catch (error) { return handleApiError(error); }
}
