import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { getFiscalStatus } from "@/lib/fiscal";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    return ok({ data: getFiscalStatus() });
  } catch (error) {
    return handleApiError(error);
  }
}
