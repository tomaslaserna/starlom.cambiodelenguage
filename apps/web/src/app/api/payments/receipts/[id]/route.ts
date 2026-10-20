import { NextResponse } from "next/server";
import { ApiError, handleApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_READ_PERMISSION, CRM_READ_PERMISSION, requireApiSession, sessionAllows } from "@/lib/route-auth";
import { assertVendorOwnsClient } from "@/lib/crm";
import { assertCompanyStoragePath, createSignedStorageUrl, parseStorageObjectReference } from "@/lib/storage";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiSession([COLLECTIONS_READ_PERMISSION, CRM_READ_PERMISSION]);
    const id = uuidParam((await context.params).id, "Pago");
    const rows = await queryWithCompanyContext<{ receipt_url: string; client_id: string }>(session.companyId,
      "SELECT receipt_url, client_id::text AS client_id FROM payments WHERE id = $1::uuid AND empresa_id = $2 AND entity_type = 'cliente' LIMIT 1", [id, session.companyId]);
    const reference = parseStorageObjectReference(rows.rows[0]?.receipt_url ?? "");
    if (!reference) throw new ApiError(404, "Comprobante no encontrado");
    if (!(await sessionAllows(session, [COLLECTIONS_READ_PERMISSION]))) await assertVendorOwnsClient(session, rows.rows[0].client_id);
    assertCompanyStoragePath(reference.path, session.companyId);
    const response = NextResponse.redirect(await createSignedStorageUrl(reference.bucket, reference.path, 60));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return handleApiError(error); }
}
