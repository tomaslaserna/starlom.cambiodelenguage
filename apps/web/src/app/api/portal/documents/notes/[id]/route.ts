import { ApiError, handleApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { buildFiscalSalesNotePdf } from "@/lib/pdf/documents";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { pdfResponse } from "@/lib/pdf/renderer";
import { uuidParam } from "@/lib/request-body";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requirePortalIdentity(request);
    const { id } = await params;
    const noteId = uuidParam(id, "Nota fiscal");
    const allowed = await queryWithCompanyContext(
      identity.companyId,
      `SELECT 1 FROM sales_internal_documents sid JOIN sales s ON s.id=sid.sale_id AND s.empresa_id=sid.empresa_id WHERE sid.id=$1::uuid AND sid.empresa_id=$2 AND s.client_id=ANY($3::uuid[]) AND sid.fiscal=true AND sid.class_name IN ('NC','ND') AND sid.fiscal_status='aprobado'`,
      [noteId, identity.companyId, identity.clientIds],
      { cache: false },
    );
    if (!allowed.rows.length)
      throw new ApiError(404, "La nota fiscal no pertenece a tu cuenta");
    return pdfResponse(
      await buildFiscalSalesNotePdf(identity.companyId, noteId),
      new URL(request.url).searchParams.get("download") !== "1",
    );
  } catch (error) {
    return handleApiError(error);
  }
}
