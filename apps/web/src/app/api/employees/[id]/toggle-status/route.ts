import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { toggleEmployeeStatus } from "@/lib/employees";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "empleados", action: "editar" }]);
    const { id } = await context.params;
    const data = await toggleEmployeeStatus(session, id);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
