import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import type { AuthSession } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { acceptQuote } from "@/lib/quotes";
import { createPreference } from "@/lib/mercadopago";

const COMPANY_ID = 1;

type MercadoPagoPayment = {
  id?: string | number;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
};

export async function createStorefrontPayment(input: {
  quoteId: string;
  requestKey: string;
  amount: number;
  email: string;
  origin: string;
}) {
  const intentId = randomUUID();
  const intent = await withCompanyContext(COMPANY_ID, async (client) => {
    const existing = await client.query<{ id: string; amount: string; mp_preference_id: string | null }>(
      `SELECT id::text,amount::text,mp_preference_id FROM storefront_payment_intents
        WHERE empresa_id=$1 AND request_key=$2::uuid LIMIT 1`,
      [COMPANY_ID, input.requestKey],
    );
    if (existing.rows[0]) return existing.rows[0];
    return (await client.query<{ id: string; amount: string; mp_preference_id: string | null }>(
      `INSERT INTO storefront_payment_intents (id,empresa_id,quote_id,request_key,amount)
       VALUES ($1,$2,$3::uuid,$4::uuid,$5) RETURNING id::text,amount::text,mp_preference_id`,
      [intentId, COMPANY_ID, input.quoteId, input.requestKey, input.amount],
    )).rows[0];
  });
  if (!intent) throw new ApiError(500, "No se pudo iniciar el pago");

  const preference = await createPreference({
    intentId: intent.id,
    amount: Number(intent.amount),
    description: "Pedido Tienda Starlim",
    email: input.email,
    origin: input.origin,
    returnPath: "/tienda",
  });
  const checkoutUrl = String(preference.init_point || "");
  if (!checkoutUrl) throw new ApiError(502, "Mercado Pago no devolvió el enlace de pago");
  await withCompanyContext(COMPANY_ID, (client) => client.query(
    `UPDATE storefront_payment_intents SET mp_preference_id=$1,updated_at=now()
      WHERE empresa_id=$2 AND id=$3::uuid`,
    [preference.id, COMPANY_ID, intent.id],
  ));
  return {
    intentId: intent.id,
    requestKey: input.requestKey,
    amount: Number(intent.amount),
    checkoutUrl,
    qrDataUrl: await QRCode.toDataURL(checkoutUrl, { width: 320, margin: 1 }),
  };
}

export async function processStorefrontPayment(payment: MercadoPagoPayment, companyId = COMPANY_ID) {
  const intentId = String(payment.external_reference || "");
  const paymentReference = String(payment.id || "");
  if (!intentId || !paymentReference) return null;
  const intent = (await queryWithCompanyContext<{
    id: string; quote_id: string; amount: string; status: string; seller_id: string | null;
  }>(companyId, `SELECT i.id::text,i.quote_id::text,i.amount::text,i.status,q.seller_id::text
      FROM storefront_payment_intents i JOIN quotes q ON q.id=i.quote_id AND q.empresa_id=i.empresa_id
     WHERE i.empresa_id=$1 AND i.id=$2::uuid`, [companyId, intentId], { cache: false })).rows[0];
  if (!intent || intent.status === "approved") return intent?.status ?? null;

  if (payment.status !== "approved") {
    const status = payment.status === "rejected" ? "rejected" : "pending";
    await withCompanyContext(companyId, (client) => client.query(
      `UPDATE storefront_payment_intents SET status=$1,mp_payment_id=$2,updated_at=now()
        WHERE empresa_id=$3 AND id=$4::uuid`, [status, paymentReference, companyId, intentId],
    ));
    return status;
  }
  if (Math.abs(Number(payment.transaction_amount) - Number(intent.amount)) > 0.01) {
    throw new Error("Mercado Pago amount mismatch");
  }
  if (!intent.seller_id) throw new Error("Storefront payment quote has no seller");
  const session: AuthSession = {
    userId: intent.seller_id, username: "Tienda Starlim", email: "tienda@starlim.com.ar",
    displayName: "Tienda Starlim", role: "vendedor", companyId, companyName: "Starlim",
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  };
  const order = await acceptQuote(session, intent.quote_id);
  await withCompanyContext(companyId, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(83015,hashtext($1))", [paymentReference]);
    const sale = (await client.query<{ client_id: string }>(
      `SELECT client_id::text FROM sales WHERE empresa_id=$1 AND id=$2::uuid`, [companyId, order.orderId],
    )).rows[0];
    if (!sale?.client_id) throw new Error("Converted storefront order has no client");
    let paymentId = (await client.query<{ id: string }>(
      `SELECT id::text FROM payments WHERE empresa_id=$1 AND reference=$2 LIMIT 1`,
      [companyId, `Mercado Pago #${paymentReference}`],
    )).rows[0]?.id;
    if (!paymentId) {
      paymentId = (await client.query<{ id: string }>(
        `INSERT INTO payments (client_id,payment_date,amount,method,reference,status,entity_type,entity_name,concept,notes,empresa_id)
         SELECT $1::uuid,CURRENT_DATE,$2,'transferencia',$3,'registrado','cliente',COALESCE(display_name,''),'Pedido Tienda abonado por Mercado Pago','Acreditado automáticamente antes de enviar el pedido al ERP',$4
           FROM clients WHERE id=$1::uuid AND empresa_id=$4 RETURNING id::text`,
        [sale.client_id, intent.amount, `Mercado Pago #${paymentReference}`, companyId],
      )).rows[0]?.id;
    }
    if (!paymentId) throw new Error("Storefront customer not found");
    await client.query(
      `INSERT INTO current_account_movements (client_id,sale_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id)
       SELECT $1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,0,$4,$5,'cliente',COALESCE(display_name,''),$6
         FROM clients WHERE id=$1::uuid AND empresa_id=$6
          AND NOT EXISTS (SELECT 1 FROM current_account_movements WHERE empresa_id=$6 AND payment_id=$3::uuid AND sale_id=$2::uuid)`,
      [sale.client_id, order.orderId, paymentId, intent.amount, `Pedido Tienda pagado · Mercado Pago #${paymentReference}`, companyId],
    );
    await client.query(
      `UPDATE sales SET collection_status='recibido',payment_condition='Mercado Pago - pagado',
       notes=CONCAT_WS(E'\n',NULLIF(notes,''),'PEDIDO PAGADO — NO COBRAR AL ENTREGAR. Pago acreditado por Mercado Pago el '||TO_CHAR(CURRENT_DATE,'DD/MM/YYYY')||'.'),updated_at=now()
       WHERE empresa_id=$1 AND id=$2::uuid`, [companyId, order.orderId],
    );
    await client.query(
      `UPDATE storefront_payment_intents SET status='approved',mp_payment_id=$1,approved_at=now(),updated_at=now()
        WHERE empresa_id=$2 AND id=$3::uuid`, [paymentReference, companyId, intentId],
    );
    await client.query(
      `INSERT INTO audit_log (action,entity_table,entity_id,new_data,empresa_id)
       VALUES ('storefront_order.mercadopago_approved','sales',$1::uuid,$2::jsonb,$3)`,
      [order.orderId, JSON.stringify({ mpPaymentId: paymentReference, intentId }), companyId],
    );
  });
  return "approved";
}
