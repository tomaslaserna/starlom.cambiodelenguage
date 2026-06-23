import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { companyIdFromRequest } from "@/lib/company";
import { listPendingCollections } from "@/lib/collections";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const data = await listPendingCollections(companyIdFromRequest(request));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

