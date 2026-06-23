import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { importProductCodesFromCsv } from "@/lib/imports";
import { requireAdminApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminApiSession();
    const data = await importProductCodesFromCsv(request, session.companyId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
