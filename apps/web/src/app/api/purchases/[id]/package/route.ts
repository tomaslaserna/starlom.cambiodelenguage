import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { packageReviewFromBody, reviewPurchasePackage } from "@/lib/purchases";
import { positiveId, readRequestBody } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "editar" }]);
    const { id } = await context.params;
    const body = await readRequestBody(request);
    const data = await reviewPurchasePackage(
      session,
      positiveId(id, "Compra"),
      packageReviewFromBody(body),
    );
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

