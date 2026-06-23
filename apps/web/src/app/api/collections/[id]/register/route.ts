import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { collectionRegistrationFromBody, registerCollection } from "@/lib/collections";
import { positiveId, readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "cobranzas", action: "crear" }]);
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const data = await registerCollection(
      session,
      positiveId(id, "Venta"),
      collectionRegistrationFromBody(body),
    );
    return ok({ data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

