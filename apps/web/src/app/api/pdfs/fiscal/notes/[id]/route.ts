import { handleApiError } from "@/lib/api-response";
import { buildFiscalSalesNotePdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "ventas", action: "ver" }]);
    const { id } = await context.params;
    const file = await buildFiscalSalesNotePdf(session.companyId, uuidParam(id, "Nota fiscal"));
    return pdfResponse(file, new URL(request.url).searchParams.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
