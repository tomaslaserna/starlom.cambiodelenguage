import { handleApiError, ok } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import { getPayment, validWebhookSignature } from "@/lib/mercadopago";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const dataId = String(url.searchParams.get("data.id") || body?.data?.id || "");
    const type = String(url.searchParams.get("type") || body?.type || "");
    if (type !== "payment") return ok({ received: true });
    if (!validWebhookSignature(request, dataId)) return Response.json({ ok: false, error: "Firma inválida" }, { status: 401 });
    const payment = await getPayment(dataId);
    const intentId = String(payment.external_reference || "");
    if (!intentId) return ok({ received: true });
    await withCompanyContext(1, async (client) => {
      const found = await client.query<{ id: string; client_id: string; sale_ids: string[]; amount: string; status: string; portal_user_id: string }>(`SELECT id::text,client_id::text,sale_ids,amount::text,status,portal_user_id::text FROM customer_portal_payment_intents WHERE empresa_id=1 AND id=$1::uuid FOR UPDATE`, [intentId]);
      const intent = found.rows[0];
      if (!intent || intent.status === "approved") return;
      if (payment.status !== "approved") { await client.query(`UPDATE customer_portal_payment_intents SET status=$1,mp_payment_id=$2,updated_at=now() WHERE id=$3::uuid`, [payment.status === "rejected" ? "rejected" : "pending", dataId, intentId]); return; }
      if (Math.abs(Number(payment.transaction_amount) - Number(intent.amount)) > 0.01) throw new Error("Mercado Pago amount mismatch");
      const created = await client.query<{ id: string }>(`INSERT INTO payments (client_id,payment_date,amount,method,reference,status,registered_by,entity_type,entity_name,concept,notes,empresa_id) SELECT $1::uuid,CURRENT_DATE,$2,'transferencia',$3,'registrado',$4::uuid,'cliente',COALESCE(c.display_name,''),'Cobro Mercado Pago','Acreditado automáticamente por webhook',1 FROM clients c WHERE c.id=$1::uuid AND c.empresa_id=1 RETURNING id::text`, [intent.client_id, intent.amount, `Mercado Pago #${dataId}`, intent.portal_user_id]);
      const paymentId = created.rows[0]?.id; if (!paymentId) throw new Error("Customer not found");
      let applied = 0;
      for (const saleId of intent.sale_ids) {
        const sale = await client.query<{ outstanding: string }>(`SELECT GREATEST(COALESCE(s.total_amount,0)+COALESCE(m.debits,0)-COALESCE(m.credits,0),0)::text outstanding FROM sales s LEFT JOIN LATERAL (SELECT COALESCE(SUM(debit) FILTER (WHERE description ILIKE 'nota de debito%' OR description ILIKE 'anulacion de cobro%'),0) debits,COALESCE(SUM(credit),0) credits FROM current_account_movements WHERE empresa_id=s.empresa_id AND sale_id=s.id) m ON true WHERE s.empresa_id=1 AND s.id=$1::uuid AND s.client_id=$2::uuid FOR UPDATE OF s`, [saleId, intent.client_id]);
        const amount = Number(sale.rows[0]?.outstanding || 0); if (amount <= 0) continue;
        await client.query(`INSERT INTO current_account_movements (client_id,sale_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id) SELECT $1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,0,$4,$5,'cliente',COALESCE(display_name,''),1 FROM clients WHERE id=$1::uuid AND empresa_id=1`, [intent.client_id, saleId, paymentId, amount, `Cobro Mercado Pago #${dataId}`]);
        applied += amount;
        await client.query(`UPDATE sales SET collection_status='recibido',updated_at=now() WHERE empresa_id=1 AND id=$1::uuid`, [saleId]);
      }
      const unallocated = Math.max(0, Number(intent.amount) - applied);
      if (unallocated > 0.005) await client.query(`INSERT INTO current_account_movements (client_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id) SELECT $1::uuid,$2::uuid,CURRENT_DATE,0,$3,$4,'cliente',COALESCE(display_name,''),1 FROM clients WHERE id=$1::uuid AND empresa_id=1`, [intent.client_id, paymentId, unallocated, `Saldo a favor Mercado Pago #${dataId}`]);
      await client.query(`UPDATE customer_portal_payment_intents SET status='approved',mp_payment_id=$1,approved_at=now(),updated_at=now() WHERE id=$2::uuid`, [dataId, intentId]);
      await client.query(`INSERT INTO audit_log (actor_id,action,entity_table,entity_id,new_data,empresa_id) VALUES ($1::uuid,'customer_payment.mercadopago_approved','payments',$2::uuid,$3::jsonb,1)`, [intent.portal_user_id, paymentId, JSON.stringify({ mpPaymentId: dataId, intentId })]);
    });
    return ok({ received: true });
  } catch (error) { return handleApiError(error); }
}
