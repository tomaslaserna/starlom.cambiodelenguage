import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { getNavigationIndicators } from "@/lib/navigation";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireApiSession();
    const data = await getNavigationIndicators(session);
    const response = NextResponse.json({ ok: true, data });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
