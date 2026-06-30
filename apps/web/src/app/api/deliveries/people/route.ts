import { handleApiError, ok } from "@/lib/api-response";
import { listDeliveryPeople } from "@/lib/deliveries";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireApiSession([{ resource: "pedidos", action: "ver" }]);
    const data = await listDeliveryPeople();
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
