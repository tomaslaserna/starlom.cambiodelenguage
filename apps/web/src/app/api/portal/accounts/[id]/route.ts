import { handleApiError, ok } from "@/lib/api-response";
import { getCustomerStatement } from "@/lib/customer-accounts";
import { statementSinceLastZero } from "@/lib/customer-statement-presentation";
import { requirePortalStatementAccess } from "@/lib/portal-statement-access";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { companyId, clientId } = await requirePortalStatementAccess(request, (await context.params).id);
    const full = await getCustomerStatement(companyId, clientId, {});
    const current = statementSinceLastZero(full.statement);
    const completeHistory = new URL(request.url).searchParams.get("history") === "completo";
    const response = ok({ data: {
      clientId, customerName: full.customer.name, currentBalance: full.statement.finalBalance,
      statement: completeHistory ? full.statement : current.statement,
      lastZeroDate: current.lastZeroDate, hiddenCount: completeHistory ? 0 : current.hiddenCount,
      completeHistory,
    } });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleApiError(error); }
}
