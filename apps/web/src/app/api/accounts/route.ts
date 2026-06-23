import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import {
  accountMovementFromBody,
  createAccountMovement,
  listAccountMovements,
} from "@/lib/accounts";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const searchParams = request.nextUrl.searchParams;
    const result = await listAccountMovements({
      companyId: companyIdFromRequest(request),
      type: searchParams.get("type") ?? searchParams.get("tipo"),
      name: searchParams.get("name") ?? searchParams.get("nombre"),
      from: searchParams.get("from") ?? searchParams.get("desde"),
      to: searchParams.get("to") ?? searchParams.get("hasta"),
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
    });
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "cobranzas", action: "editar" }]);
    const body = await readRequestBody(request);
    const data = await createAccountMovement(session.companyId, accountMovementFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

