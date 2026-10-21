import "server-only";
import { queryWithCompanyContext } from "@/lib/db";
import type { PaymentReceiptReading } from "@/lib/payment-receipt";

// Read-only warning. Never exposes another customer's payment details or writes money.
export async function findPaymentReceiptDuplicate(companyId: number, input: {
  hash?: string; clientId?: string; reading?: PaymentReceiptReading;
}): Promise<{ kind: "receipt" | "details" } | null> {
  if (input.hash && /^[0-9a-f]{64}$/.test(input.hash)) {
    const result = await queryWithCompanyContext(companyId,
      `SELECT 1 FROM payments WHERE empresa_id = $1
       AND status::text <> 'anulado' AND receipt_url LIKE $2 LIMIT 1`,
      [companyId, `%_${input.hash}.%`], { cache: false });
    if (result.rows.length) return { kind: "receipt" };
  }
  const value = input.reading;
  if (!input.clientId || !value?.operation || value.amount === null || !value.date) return null;
  const result = await queryWithCompanyContext(companyId,
    `SELECT 1 FROM payments WHERE empresa_id = $1 AND client_id = $2::uuid
     AND status::text IN ('registrado', 'pendiente_aprobacion')
     AND payment_date = $3::date AND amount = $4::numeric AND method::text = 'transferencia'
     AND upper(trim(COALESCE(NULLIF(treasury_reference, ''), split_part(reference, ' | ', 1), ''))) = upper(trim($5))
     LIMIT 1`, [companyId, input.clientId, value.date, value.amount, value.operation], { cache: false });
  return result.rows.length ? { kind: "details" } : null;
}
