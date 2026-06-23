import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { createPriceList, listPriceLists, priceListInputFromBody } from "@/lib/pricing";
import { readRequestBody } from "@/lib/request-body";
import { requireAdminApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
    const data = await listPriceLists(companyIdFromRequest(request), includeInactive);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminApiSession();
    const body = await readRequestBody(request);
    const data = await createPriceList(session.companyId, priceListInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
