import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { createEmployee, listEmployees } from "@/lib/employees";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([{ resource: "empleados", action: "ver" }]);
    const data = await listEmployees(session.companyId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "empleados", action: "crear" }]);
    const body = await readRequestBody(request);
    const data = await createEmployee(session, body);
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
