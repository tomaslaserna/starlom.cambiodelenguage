import { handleApiError, ok } from "@/lib/api-response";
import { listEmployeePermissions } from "@/lib/employees";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([
      { resource: "empleados", action: "administrar" },
      { resource: "empleados", action: "editar" },
    ]);
    const data = await listEmployeePermissions(session.companyId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
