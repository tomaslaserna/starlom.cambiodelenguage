import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { rejectCollection, rejectionReasonFromBody } from "@/lib/collections";
import { readRequestBody, uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "cobranzas", action: "aprobar" }]);
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const data = await rejectCollection(
      session,
      uuidParam(id, "Venta"),
      rejectionReasonFromBody(body),
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
