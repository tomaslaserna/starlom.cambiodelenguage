import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { createBankFolder } from "@/lib/bank-store";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession();
    const body = await readRequestBody(request, 4 * 1024);
    const data = await createBankFolder(session, body.scope, body.name);
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
