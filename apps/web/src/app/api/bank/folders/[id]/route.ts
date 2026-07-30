import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { deleteBankFolder } from "@/lib/bank-store";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession();
    const { id } = await context.params;
    await deleteBankFolder(session, id);
    return ok({ data: { ok: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
