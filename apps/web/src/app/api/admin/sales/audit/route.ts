import { handleApiError, ok } from "@/lib/api-response";
import { listSalesAdminAudit } from "@/lib/sales-admin";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "editar" }]);
    const data = await listSalesAdminAudit(session.companyId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
