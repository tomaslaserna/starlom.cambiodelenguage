import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { requireApiAccess } from "@/lib/api-auth";
import { listDeliveryPeople } from "@/lib/deliveries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const data = await listDeliveryPeople();
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

