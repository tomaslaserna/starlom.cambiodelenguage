import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { createQuote, listQuotes, quoteInputFromBody } from "@/lib/quotes";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const status = request.nextUrl.searchParams.get("status") ?? "pendiente";
    const data = await listQuotes(companyIdFromRequest(request), status);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "presupuestos", action: "crear" }]);
    const body = await readRequestBody(request);
    const data = await createQuote(session, quoteInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

