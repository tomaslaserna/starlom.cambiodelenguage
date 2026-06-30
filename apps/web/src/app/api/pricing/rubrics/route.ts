import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { listRubrics, rubricInputFromBody, upsertRubric } from "@/lib/pricing";
import { readRequestBody } from "@/lib/request-body";
import { requireAdminApiSession, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([{ resource: "productos", action: "ver" }]);
    const data = await listRubrics(session.companyId);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminApiSession();
    const body = await readRequestBody(request);
    const data = await upsertRubric(session.companyId, rubricInputFromBody(body));
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
