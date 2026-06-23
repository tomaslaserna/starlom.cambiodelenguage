import { handleApiError, ok } from "@/lib/api-response";
import { getCashflow } from "@/lib/admin-metrics";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([
      { resource: "admin.tesoreria", action: "ver" },
      { resource: "cobranzas", action: "ver" },
    ]);
    const data = await getCashflow(session.companyId);
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}

