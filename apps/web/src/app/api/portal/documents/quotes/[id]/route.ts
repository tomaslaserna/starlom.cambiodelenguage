import { type NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { buildQuotePdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { requirePortalIdentity } from "@/lib/portal-auth";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const identity = await requirePortalIdentity(request);
    const { id } = await context.params;
    const allowed = await queryWithCompanyContext(identity.companyId, `SELECT 1 FROM quotes WHERE id=$1::uuid AND empresa_id=$2 AND client_id=ANY($3::uuid[]) AND created_at::date + validity_days >= CURRENT_DATE`, [id, identity.companyId, identity.clientIds], { cache: false });
    if (!allowed.rows[0]) throw new ApiError(404, "Presupuesto no disponible");
    return pdfResponse(await buildQuotePdf(identity.companyId, id), true);
  } catch (error) { return handleApiError(error); }
}
