import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { multiplierInputFromBody, updatePriceListMultiplier } from "@/lib/pricing";
import { readRequestBody } from "@/lib/request-body";
import { requireAdminApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminApiSession();
    const body = await readRequestBody(request);
    const data = await updatePriceListMultiplier(session.companyId, multiplierInputFromBody(body));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export const PATCH = POST;
