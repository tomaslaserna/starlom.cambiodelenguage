import { type AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { acceptQuote } from "@/lib/quotes";

type MercadoPagoPayment = {
  id?: string | number;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
};

type IntentRow = {
  id: string;
  client_id: string;
  sale_ids: string[];
  amount: string;
  status: string;
  portal_user_id: string;
  purpose: "account_payment" | "order_payment";
  quote_id: string | null;
  seller_id: string | null;
  quote_number: string | null;
};

export async function processPortalPayment(
  payment: MercadoPagoPayment,
  companyId = 1,
) {
  const intentId = String(payment.external_reference || "");
  const paymentReference = String(payment.id || "");
  if (!intentId || !paymentReference) return null;

  const intent = (
    await queryWithCompanyContext<IntentRow>(
      companyId,
      `SELECT i.id::text,i.client_id::text,COALESCE(i.sale_ids,'{}'::uuid[]) sale_ids,i.amount::text,i.status,i.portal_user_id::text,
              CASE WHEN q.id IS NULL THEN 'account_payment' ELSE 'order_payment' END purpose,q.id::text quote_id,q.seller_id::text,q.quote_number
         FROM customer_portal_payment_intents i
         LEFT JOIN quotes q ON q.id=i.sale_ids[1] AND q.empresa_id=i.empresa_id
        WHERE i.empresa_id=$1 AND i.id=$2::uuid`,
      [companyId, intentId],
      { cache: false },
    )
  ).rows[0];
  if (!intent || intent.status === "approved") return intent?.status ?? null;

  if (payment.status !== "approved") {
    const status = payment.status === "rejected" ? "rejected" : "pending";
    await withCompanyContext(companyId, (client) =>
      client.query(
        `UPDATE customer_portal_payment_intents SET status=$1,mp_payment_id=$2,updated_at=now() WHERE id=$3::uuid AND empresa_id=$4`,
        [status, paymentReference, intentId, companyId],
      ),
    );
    return status;
  }
  if (
    Math.abs(Number(payment.transaction_amount) - Number(intent.amount)) > 0.01
  ) {
    throw new Error("Mercado Pago amount mismatch");
  }

  if (intent.purpose === "order_payment") {
    if (!intent.quote_id || !intent.seller_id)
      throw new Error("Portal order payment is missing its quote or seller");
    const session: AuthSession = {
      userId: intent.seller_id,
      username: "Portal de clientes",
      email: "portal@starlim.com.ar",
      displayName: "Portal de clientes",
      role: "vendedor",
      companyId,
      companyName: "Starlim",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    };
    const order = await acceptQuote(session, intent.quote_id);
    await withCompanyContext(companyId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(83014,hashtext($1))", [
        paymentReference,
      ]);
      const existing = await client.query<{ id: string }>(
        `SELECT id::text FROM payments WHERE empresa_id=$1 AND reference=$2 LIMIT 1`,
        [companyId, `Mercado Pago #${paymentReference}`],
      );
      let paymentId = existing.rows[0]?.id;
      if (!paymentId) {
        const created = await client.query<{ id: string }>(
          `INSERT INTO payments (client_id,payment_date,amount,method,reference,status,entity_type,entity_name,concept,notes,empresa_id)
           SELECT $1::uuid,CURRENT_DATE,$2,'transferencia',$3,'registrado','cliente',COALESCE(c.display_name,''),'Pedido abonado por Mercado Pago','Acreditado automáticamente antes de enviar el pedido al ERP',$4
             FROM clients c WHERE c.id=$1::uuid AND c.empresa_id=$4 RETURNING id::text`,
          [
            intent.client_id,
            intent.amount,
            `Mercado Pago #${paymentReference}`,
            companyId,
          ],
        );
        paymentId = created.rows[0]?.id;
      }
      if (!paymentId) throw new Error("Customer not found");
      await client.query(
        `INSERT INTO current_account_movements (client_id,sale_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id)
         SELECT $1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,0,$4,$5,'cliente',COALESCE(display_name,''),$6
           FROM clients
          WHERE id=$1::uuid AND empresa_id=$6
            AND NOT EXISTS (SELECT 1 FROM current_account_movements WHERE empresa_id=$6 AND payment_id=$3::uuid AND sale_id=$2::uuid)`,
        [
          intent.client_id,
          order.orderId,
          paymentId,
          intent.amount,
          `Pedido abonado por Mercado Pago #${paymentReference}`,
          companyId,
        ],
      );
      await client.query(
        `UPDATE sales SET collection_status='recibido',payment_condition='contado',updated_at=now() WHERE empresa_id=$1 AND id=$2::uuid`,
        [companyId, order.orderId],
      );
      await client.query(
        `UPDATE customer_portal_payment_intents SET status='approved',mp_payment_id=$1,approved_at=now(),updated_at=now() WHERE id=$2::uuid AND empresa_id=$3`,
        [paymentReference, intentId, companyId],
      );
      await client.query(
        `INSERT INTO audit_log (action,entity_table,entity_id,new_data,empresa_id) VALUES ('customer_order.mercadopago_approved','sales',$1::uuid,$2::jsonb,$3)`,
        [
          order.orderId,
          JSON.stringify({
            mpPaymentId: paymentReference,
            intentId,
            quoteNumber: intent.quote_number,
          }),
          companyId,
        ],
      );
    });
    return "approved";
  }

  return withCompanyContext(companyId, async (client) => {
    const found = await client.query<IntentRow>(
      `SELECT id::text,client_id::text,COALESCE(sale_ids,'{}'::uuid[]) sale_ids,amount::text,status,portal_user_id::text,
              'account_payment'::text purpose,NULL::text quote_id,NULL::text seller_id,NULL::text quote_number
         FROM customer_portal_payment_intents WHERE empresa_id=$1 AND id=$2::uuid FOR UPDATE`,
      [companyId, intentId],
    );
    const locked = found.rows[0];
    if (!locked || locked.status === "approved") return locked?.status ?? null;

    const created = await client.query<{ id: string }>(
      `INSERT INTO payments (client_id,payment_date,amount,method,reference,status,entity_type,entity_name,concept,notes,empresa_id)
       SELECT $1::uuid,CURRENT_DATE,$2,'transferencia',$3,'registrado','cliente',COALESCE(c.display_name,''),'Cobro Mercado Pago','Acreditado automáticamente por Mercado Pago',$4
         FROM clients c WHERE c.id=$1::uuid AND c.empresa_id=$4 RETURNING id::text`,
      [
        locked.client_id,
        locked.amount,
        `Mercado Pago #${paymentReference}`,
        companyId,
      ],
    );
    const paymentId = created.rows[0]?.id;
    if (!paymentId) throw new Error("Customer not found");

    let applied = 0;
    for (const saleId of locked.sale_ids) {
      const sale = await client.query<{ outstanding: string }>(
        `SELECT GREATEST(COALESCE(s.total_amount,0)+COALESCE(m.debits,0)-COALESCE(m.credits,0),0)::text outstanding
           FROM sales s
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(debit) FILTER (WHERE description ILIKE 'nota de debito%' OR description ILIKE 'anulacion de cobro%'),0) debits,
                    COALESCE(SUM(credit),0) credits
               FROM current_account_movements WHERE empresa_id=s.empresa_id AND sale_id=s.id
           ) m ON true
          WHERE s.empresa_id=$1 AND s.id=$2::uuid AND s.client_id=$3::uuid FOR UPDATE OF s`,
        [companyId, saleId, locked.client_id],
      );
      const remaining = Math.max(0, Number(locked.amount) - applied);
      const amount = Math.min(
        Number(sale.rows[0]?.outstanding || 0),
        remaining,
      );
      if (amount <= 0) continue;
      await client.query(
        `INSERT INTO current_account_movements (client_id,sale_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id)
         SELECT $1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,0,$4,$5,'cliente',COALESCE(display_name,''),$6
           FROM clients WHERE id=$1::uuid AND empresa_id=$6`,
        [
          locked.client_id,
          saleId,
          paymentId,
          amount,
          `Cobro Mercado Pago #${paymentReference}`,
          companyId,
        ],
      );
      applied += amount;
      await client.query(
        `UPDATE sales SET collection_status='recibido',updated_at=now() WHERE empresa_id=$1 AND id=$2::uuid`,
        [companyId, saleId],
      );
    }

    const unallocated = Math.max(0, Number(locked.amount) - applied);
    if (unallocated > 0.005) {
      await client.query(
        `INSERT INTO current_account_movements (client_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id)
         SELECT $1::uuid,$2::uuid,CURRENT_DATE,0,$3,$4,'cliente',COALESCE(display_name,''),$5
           FROM clients WHERE id=$1::uuid AND empresa_id=$5`,
        [
          locked.client_id,
          paymentId,
          unallocated,
          `Saldo a favor Mercado Pago #${paymentReference}`,
          companyId,
        ],
      );
    }
    await client.query(
      `UPDATE customer_portal_payment_intents SET status='approved',mp_payment_id=$1,approved_at=now(),updated_at=now() WHERE id=$2::uuid AND empresa_id=$3`,
      [paymentReference, intentId, companyId],
    );
    await client.query(
      `INSERT INTO audit_log (action,entity_table,entity_id,new_data,empresa_id) VALUES ('customer_payment.mercadopago_approved','payments',$1::uuid,$2::jsonb,$3)`,
      [
        paymentId,
        JSON.stringify({
          mpPaymentId: paymentReference,
          intentId,
          portalUserId: locked.portal_user_id,
        }),
        companyId,
      ],
    );
    return "approved";
  });
}
