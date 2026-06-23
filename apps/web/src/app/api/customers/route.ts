import { NextResponse, type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { listCustomers } from "@/lib/catalog";
import {
  createCustomer,
  customerInputFromBody,
} from "@/lib/catalog-management";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  const searchParams = request.nextUrl.searchParams;
  const result = await listCustomers({
    companyId: companyIdFromRequest(request),
    query: searchParams.get("q"),
    page: searchParams.get("page"),
    pageSize: searchParams.get("pageSize"),
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "clientes", action: "crear" }]);
    const body = await readRequestBody(request);
    const data = await createCustomer(session.companyId, customerInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
