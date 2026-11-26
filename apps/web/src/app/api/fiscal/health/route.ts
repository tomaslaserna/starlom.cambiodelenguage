import { timingSafeEqual } from "node:crypto";
import { lastAuthorizedReceipt } from "@/lib/arca/wsfe";
import { requireApiSession } from "@/lib/route-auth";
import { handleApiError } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const secret = process.env.STARLIM_FISCAL_HEALTH_TOKEN?.trim();
    const supplied = Buffer.from(request.headers.get("authorization") || "");
    const expected = Buffer.from("Bearer " + secret);
    if (!secret || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      await requireApiSession([{ resource: "ventas", action: "ver" }]);
    }
    await lastAuthorizedReceipt(1);
    return Response.json({ ok: true, operation: "FECompUltimoAutorizado", region: process.env.VERCEL_REGION },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}
