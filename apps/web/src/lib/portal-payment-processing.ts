import { withCompanyContext } from "@/lib/db";

type MercadoPagoPayment = {
  id?: string | number;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
};

export async function processPortalPayment(payment: MercadoPagoPayment, companyId = 1) {
  const intentId = String(payment.external_reference || "");
  const paymentReference = String(payment.id || "");
  if (!intentId || !paymentReference) return null;

  return withCompanyContext(companyId, async (client) => {
    const found = await client.query<{ id: string; client_id: string; sale_ids: string[]; amount: string; status: string; portal_user_id: string }>(`SELECT id::text,client_id::text,sale_ids,amount::text,status,portal_user_id::text FROM customer_portal_payment_intents WHERE empresa_id=$1 AND id=$2::uuid FOR UPDATE`, [companyId, intentId]);
    const intent = found.rows[0];
    if (!intent || intent.status === "approved") return intent?.status ?? null;
    if (payment.status !== "approved") {
      const status = payment.status === "rejected" ? "rejected" : "pending";
      await client.query(`UPDATE customer_portal_payment_intents SET status=$1,mp_payment_id=$2,updated_at=now() WHERE id=$3::uuid AND empresa_id=$4`, [status, paymentReference, intentId, companyId]);
      return status;
    }
    if (Math.abs(Number(payment.transaction_amount) - Number(intent.amount)) > 0.01) throw new Error("Mercado Pago amount mismatch");

    const created = await client.query<{ id: string }>(`INSERT INTO payments (client_id,payment_date,amount,method,reference,status,registered_by,entity_type,entity_name,concept,notes,empresa_id) SELECT $1::uuid,CURRENT_DATE,$2,'transferencia',$3,'registrado',$4::uuid,'cliente',COALESCE(c.display_name,''),'Cobro Mercado Pago','Acreditado automáticamente por Mercado Pago',$5 FROM clients c WHERE c.id=$1::uuid AND c.empresa_id=$5 RETURNING id::text`, [intent.client_id, intent.amount, `Mercado Pago #${paymentReference}`, intent.portal_user_id, companyId]);
    const paymentId = created.rows[0]?.id;
    if (!paymentId) throw new Error("Customer not found");

    let applied = 0;
    for (const saleId of intent.sale_ids) {
      const sale = await client.query<{ outstanding: string }>(`SELECT GREATEST(COALESCE(s.total_amount,0)+COALESCE(m.debits,0)-COALESCE(m.credits,0),0)::text outstanding FROM sales s LEFT JOIN LATERAL (SELECT COALESCE(SUM(debit) FILTER (WHERE description ILIKE 'nota de debito%' OR description ILIKE 'anulacion de cobro%'),0) debits,COALESCE(SUM(credit),0) credits FROM current_account_movements WHERE empresa_id=s.empresa_id AND sale_id=s.id) m ON true WHERE s.empresa_id=$1 AND s.id=$2::uuid AND s.client_id=$3::uuid FOR UPDATE OF s`, [companyId, saleId, intent.client_id]);
      const remaining = Math.max(0, Number(intent.amount) - applied);
      const amount = Math.min(Number(sale.rows[0]?.outstanding || 0), remaining);
      if (amount <= 0) continue;
      await client.query(`INSERT INTO current_account_movements (client_id,sale_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id) SELECT $1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,0,$4,$5,'cliente',COALESCE(display_name,''),$6 FROM clients WHERE id=$1::uuid AND empresa_id=$6`, [intent.client_id, saleId, paymentId, amount, `Cobro Mercado Pago #${paymentReference}`, companyId]);
      applied += amount;
      await client.query(`UPDATE sales SET collection_status='recibido',updated_at=now() WHERE empresa_id=$1 AND id=$2::uuid`, [companyId, saleId]);
    }

    const unallocated = Math.max(0, Number(intent.amount) - applied);
    if (unallocated > 0.005) await client.query(`INSERT INTO current_account_movements (client_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id) SELECT $1::uuid,$2::uuid,CURRENT_DATE,0,$3,$4,'cliente',COALESCE(display_name,''),$5 FROM clients WHERE id=$1::uuid AND empresa_id=$5`, [intent.client_id, paymentId, unallocated, `Saldo a favor Mercado Pago #${paymentReference}`, companyId]);
    await client.query(`UPDATE customer_portal_payment_intents SET status='approved',mp_payment_id=$1,approved_at=now(),updated_at=now() WHERE id=$2::uuid AND empresa_id=$3`, [paymentReference, intentId, companyId]);
    await client.query(`INSERT INTO audit_log (actor_id,action,entity_table,entity_id,new_data,empresa_id) VALUES ($1::uuid,'customer_payment.mercadopago_approved','payments',$2::uuid,$3::jsonb,$4)`, [intent.portal_user_id, paymentId, JSON.stringify({ mpPaymentId: paymentReference, intentId }), companyId]);
    return "approved";
  });
}
