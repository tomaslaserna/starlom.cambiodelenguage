import { handleApiError } from "@/lib/api-response";
import { buildFiscalReissuePdf } from "@/lib/pdf/fiscal-reissue";
import { pdfResponse } from "@/lib/pdf/renderer";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession, SALES_READ_PERMISSION } from "@/lib/route-auth";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireApiSession([SALES_READ_PERMISSION]);
    const { id } = await context.params;
    const stage = new URL(request.url).searchParams.get("stage");
    if (stage !== "credit" && stage !== "invoice" && stage !== "original")
      throw new Error("Tipo de documento inválido.");
    return pdfResponse(
      await buildFiscalReissuePdf(
        session.companyId,
        uuidParam(id, "Venta"),
        stage,
      ),
      new URL(request.url).searchParams.get("download") !== "1",
    );
  } catch (error) {
    return handleApiError(error);
  }
}
