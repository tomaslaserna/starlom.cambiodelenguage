import { handleApiError } from "@/lib/api-response";
import { buildFiscalSalePdf } from "@/lib/pdf/documents";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { pdfResponse } from "@/lib/pdf/renderer";
import { queryWithCompanyContext } from "@/lib/db";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requirePortalIdentity(request);
    const { id } = await params;
    const allowed = await queryWithCompanyContext(identity.companyId, `SELECT 1 FROM sales WHERE empresa_id=$1 AND id=$2::uuid AND client_id=ANY($3::uuid[]) AND fiscal_status='aprobado'`, [identity.companyId, id, identity.clientIds], { cache: false });
    if (!allowed.rows.length) throw new Error("La factura no pertenece a tu cuenta");
    return pdfResponse(await buildFiscalSalePdf(identity.companyId, id), new URL(request.url).searchParams.get("download") !== "1");
  } catch (error) { return handleApiError(error); }
}
