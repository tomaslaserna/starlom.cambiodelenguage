import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { readRequestBody } from "@/lib/request-body";
import { salesFieldInputFromBody, updateSalesField } from "@/lib/sales-admin";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireApiSession([
      { resource: "ventas", action: "editar" },
      { resource: "pedidos", action: "editar" },
    ]);
    const body = await readRequestBody(request);
    const data = await updateSalesField(session, salesFieldInputFromBody(body));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = PATCH;
