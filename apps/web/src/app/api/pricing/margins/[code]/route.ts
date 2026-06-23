import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deleteMargin, marginInputFromBody, updateMargin } from "@/lib/pricing";
import { readRequestBody } from "@/lib/request-body";
import { requireAdminApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAdminApiSession();
    const { code } = await context.params;
    const body = await readRequestBody(request);
    const data = await updateMargin(session.companyId, code, marginInputFromBody(body, true));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireAdminApiSession();
    const { code } = await context.params;
    const data = await deleteMargin(session.companyId, code);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
