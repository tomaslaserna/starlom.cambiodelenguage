import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { getNavigationAuthorization } from "@/lib/navigation";
import { getOperationalNotifications } from "@/lib/operational-notifications";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireApiSession();
    const authorization = await getNavigationAuthorization(session);
    const data = await getOperationalNotifications(session, authorization);
    const response = NextResponse.json({ ok: true, data });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
