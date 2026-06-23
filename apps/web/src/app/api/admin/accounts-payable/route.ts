import { handleApiError, ok } from "@/lib/api-response";
import { getAccountsPayable } from "@/lib/admin-metrics";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([
      { resource: "admin.cuentas_por_pagar", action: "ver" },
      { resource: "compras", action: "ver" },
    ]);
    const data = await getAccountsPayable(session.companyId);
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}

