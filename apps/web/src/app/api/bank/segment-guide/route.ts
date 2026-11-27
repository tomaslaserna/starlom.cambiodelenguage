import { type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/route-auth";
import { getSegmentGuide } from "@/lib/segment-guide";
import { buildSegmentGuidePdf } from "@/lib/pdf/segment-guide";
import { pdfResponse } from "@/lib/pdf/renderer";
import { handleApiError } from "@/lib/api-response";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession();
    const guide = await getSegmentGuide(session.companyId);
    return pdfResponse(await buildSegmentGuidePdf(guide), request.nextUrl.searchParams.get("download") !== "1");
  } catch (error) {return handleApiError(error);}
}
