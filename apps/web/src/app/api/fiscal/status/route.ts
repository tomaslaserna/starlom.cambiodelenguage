import { handleApiError, ok } from "@/lib/api-response";
import { getFiscalStatus } from "@/lib/fiscal";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireApiSession([{ resource: "ventas", action: "ver" }]);
    return ok({ data: getFiscalStatus() });
  } catch (error) {
    return handleApiError(error);
  }
}
