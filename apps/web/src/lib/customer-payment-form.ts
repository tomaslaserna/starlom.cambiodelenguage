import "server-only";
import { createHash } from "node:crypto";
import type { AuthSession } from "@/lib/auth";
import { customerPaymentFromBody, registerCustomerPayment } from "@/lib/customer-accounts";
import { paymentReceiptBytes } from "@/lib/payment-receipt";
import { uploadImageFile, removeStorageObjects } from "@/lib/storage";
import { queryWithCompanyContext } from "@/lib/db";

// Both collections and CRM call this after their own permission/ownership checks.
export async function registerCustomerPaymentFromForm(session: AuthSession, formData: FormData) {
  const attachment = formData.get("receipt");
  const receipt = attachment instanceof File && attachment.size > 0 ? attachment : null;
  const bytes = receipt ? await paymentReceiptBytes(receipt) : null;
  const receiptHash = bytes ? createHash("sha256").update(bytes).digest("hex") : undefined;
  const input = customerPaymentFromBody(Object.fromEntries(formData.entries()), { hasValidatedReceipt: Boolean(receipt) });
  if (receipt && input.method !== "transferencia") throw new Error("El comprobante adjunto corresponde a una transferencia");
  const extension = receipt?.type === "image/jpeg" ? "jpg" : receipt?.type === "image/webp" ? "webp" : "png";
  const uploaded = receipt ? await uploadImageFile({
    file: new File([receipt], `${receiptHash}.${extension}`, { type: receipt.type }),
    folder: "recibos", namePrefix: `recibo_${session.companyId}_pago`, maxBytes: 3 * 1024 * 1024,
  }) : null;
  try {
    await registerCustomerPayment(session, { ...input, receiptUrl: uploaded?.url, receiptHash });
  } catch (error) {
    if (uploaded) {
      // Do not delete evidence if a commit succeeded but its acknowledgement failed.
      try {
        const saved = await queryWithCompanyContext(session.companyId, "SELECT id FROM payments WHERE empresa_id = $1 AND receipt_url = $2 LIMIT 1", [session.companyId, uploaded.url], { cache: false });
        if (!saved.rows.length) await removeStorageObjects(uploaded.bucket, [uploaded.path]);
      } catch { console.error("No se pudo comprobar o limpiar el adjunto de un pago fallido"); }
    }
    throw error;
  }
}
