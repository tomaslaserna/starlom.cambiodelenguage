import { handleApiError, ok } from "@/lib/api-response";
import { listVendors } from "@/lib/imports";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([{ resource: "empleados", action: "ver" }]);
    const data = await listVendors(session.companyId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
