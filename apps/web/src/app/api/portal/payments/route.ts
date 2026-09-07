import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { uploadImageFile } from "@/lib/storage";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const form = await request.formData();
    const saleId = String(form.get("saleId") ?? "");
    const amount = Number(form.get("amount") ?? 0);
    const file = form.get("proof");
    if (!saleId || !Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Completá el pedido y el monto");
    if (!(file instanceof File) || !file.size) throw new ApiError(400, "Adjuntá el comprobante de pago");
    const sale = await queryWithCompanyContext<{ id: string }>(identity.companyId, `SELECT id::text FROM sales WHERE empresa_id=$1 AND id=$2::uuid AND client_id=ANY($3::uuid[]) AND COALESCE(collection_status,'pendiente') IN ('pendiente','vencido')`, [identity.companyId, saleId, identity.clientIds], { cache: false });
    if (!sale.rows.length) throw new ApiError(409, "Ese pedido no admite un nuevo pago pendiente");
    const uploaded = await uploadImageFile({ file, folder: "recibos", namePrefix: `recibo_${identity.companyId}_portal_${saleId}` });
    await queryWithCompanyContext(identity.companyId, `UPDATE sales SET collection_status='pendiente_aprobacion', collection_method='transferencia', collection_registered_amount=$1, collection_date=CURRENT_DATE, collection_destination='Informado por portal', collection_operation='Comprobante adjunto', collection_notes=$2, collection_registered_by=$3, collection_registered_at=now(), updated_at=now() WHERE empresa_id=$4 AND id=$5::uuid`, [amount, `Comprobante del portal: ${uploaded.url}`, identity.email, identity.companyId, saleId], { cache: false });
    return ok({ data: { status: "pendiente_aprobacion" } }, 201);
  } catch (error) { return handleApiError(error); }
}
