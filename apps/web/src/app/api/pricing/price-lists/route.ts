import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { createPriceList, listPriceLists, priceListInputFromBody } from "@/lib/pricing";
import { readRequestBody } from "@/lib/request-body";
import { requireAdminApiSession, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "productos", action: "ver" }]);
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
    const data = await listPriceLists(session.companyId, includeInactive);
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
