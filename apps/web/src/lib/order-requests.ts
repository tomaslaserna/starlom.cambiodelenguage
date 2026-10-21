import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { acceptQuote } from "@/lib/quotes";

export type OrderRequestChannel = "tienda" | "desafio" | "portal";

export async function registerOrderRequest(input: {
  companyId: number;
  quoteId: string;
  channel: OrderRequestChannel;
  paymentMethod: string;
}) {
  const result = await queryWithCompanyContext<{ id: string }>(input.companyId,
    `INSERT INTO order_requests (empresa_id,quote_id,channel,payment_method)
     VALUES ($1,$2::uuid,$3,$4)
     ON CONFLICT (empresa_id,quote_id) DO UPDATE SET updated_at=now()
     RETURNING id::text`,
    [input.companyId,input.quoteId,input.channel,input.paymentMethod], { cache: false });
  return result.rows[0]!.id;
}

export async function listOrderRequests(companyId: number, status = "solicitud") {
  const result = await queryWithCompanyContext<{
    id:string; quote_id:string; quote_number:string; channel:OrderRequestChannel; status:string;
    payment_method:string; payment_status:string; payment_reference:string|null; total_amount:string;
    client_name:string; client_phone:string; client_address:string; notes:string; created_at:string;
    item_count:string; sla_due_at:string|null;
  }>(companyId, `
    SELECT r.id::text,r.quote_id::text,q.quote_number,r.channel,r.status,r.payment_method,r.payment_status,
           r.payment_reference,q.total_amount::text,q.client_name,q.client_phone,q.client_address,
           COALESCE(q.notes,'') notes,r.created_at::text,COUNT(qi.id)::text item_count,r.sla_due_at::text
      FROM order_requests r
      JOIN quotes q ON q.id=r.quote_id AND q.empresa_id=r.empresa_id
      LEFT JOIN quote_items qi ON qi.quote_id=q.id AND qi.empresa_id=q.empresa_id
     WHERE r.empresa_id=$1 AND ($2='' OR r.status=$2)
     GROUP BY r.id,q.id
     ORDER BY CASE r.channel WHEN 'desafio' THEN 0 WHEN 'portal' THEN 1 ELSE 2 END,r.created_at ASC`,
    [companyId,status], { cache: false });
  return result.rows.map(row => ({...row,totalAmount:Number(row.total_amount),itemCount:Number(row.item_count)}));
}

function addBusinessHours(start: Date, hours: number) {
  const due = new Date(start);
  let remaining = hours;
  while (remaining > 0) {
    due.setHours(due.getHours() + 1);
    const day = due.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return due;
}

export async function approveOrderRequest(session: AuthSession, requestId: string) {
  const request = (await queryWithCompanyContext<{quote_id:string;status:string;channel:OrderRequestChannel;payment_method:string;payment_status:string;payment_reference:string|null;total_amount:string}>(
    session.companyId,
    `SELECT r.quote_id::text,r.status,r.channel,r.payment_method,r.payment_status,r.payment_reference,q.total_amount::text
       FROM order_requests r JOIN quotes q ON q.id=r.quote_id AND q.empresa_id=r.empresa_id
      WHERE r.empresa_id=$1 AND r.id=$2::uuid`,
    [session.companyId,requestId], { cache:false })).rows[0];
  if (!request) throw new ApiError(404,"Solicitud no encontrada");
  if (request.status !== "solicitud") throw new ApiError(409,"La solicitud ya fue resuelta");
  const order = await acceptQuote(session, request.quote_id);
  const slaDue = request.channel === "desafio" ? addBusinessHours(new Date(),24) : null;
  await withCompanyContext(session.companyId, async client => {
    const updated = await client.query(
      `UPDATE order_requests SET status='aprobada',approved_order_id=$1::uuid,approved_by=$2::uuid,
              approved_at=now(),sla_due_at=$3,updated_at=now()
        WHERE empresa_id=$4 AND id=$5::uuid AND status='solicitud'`,
      [order.orderId,session.userId,slaDue,session.companyId,requestId]);
    if (!updated.rowCount) throw new ApiError(409,"La solicitud ya fue resuelta");
    await client.query(
      `UPDATE sales SET payment_condition=$1,
        notes=CONCAT_WS(E'\n',NULLIF(notes,''),$2),updated_at=now() WHERE empresa_id=$3 AND id=$4::uuid`,
      [request.payment_method,
       request.channel === "desafio" ? `DESAFÍO STARLIM: entrega comprometida antes de ${slaDue!.toLocaleString("es-AR")}.` : "Solicitud digital revisada y aprobada por un operador.",
       session.companyId,order.orderId]);
    if (request.payment_status === "pagado" && request.payment_reference) {
      const sale = (await client.query<{client_id:string;client_name:string}>(
        `SELECT client_id::text,COALESCE(client_name,'') client_name FROM sales WHERE empresa_id=$1 AND id=$2::uuid`,
        [session.companyId,order.orderId])).rows[0];
      if (sale?.client_id) {
        const reference = `Mercado Pago #${request.payment_reference}`;
        const paymentId = (await client.query<{id:string}>(
          `INSERT INTO payments (client_id,payment_date,amount,method,reference,status,entity_type,entity_name,concept,notes,empresa_id)
           VALUES ($1::uuid,CURRENT_DATE,$2,'transferencia',$3,'registrado','cliente',$4,'Pedido digital abonado','Acreditado antes de la aprobación operativa',$5)
           ON CONFLICT DO NOTHING RETURNING id::text`,
          [sale.client_id,Number(request.total_amount),reference,sale.client_name,session.companyId])).rows[0]?.id
          ?? (await client.query<{id:string}>(`SELECT id::text FROM payments WHERE empresa_id=$1 AND reference=$2 LIMIT 1`,[session.companyId,reference])).rows[0]?.id;
        if (paymentId) await client.query(
          `INSERT INTO current_account_movements (client_id,sale_id,payment_id,movement_date,debit,credit,description,entity_type,entity_name,empresa_id)
           SELECT $1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,0,$4,$5,'cliente',$6,$7
            WHERE NOT EXISTS (SELECT 1 FROM current_account_movements WHERE empresa_id=$7 AND payment_id=$3::uuid AND sale_id=$2::uuid)`,
          [sale.client_id,order.orderId,paymentId,Number(request.total_amount),reference,sale.client_name,session.companyId]);
        await client.query(`UPDATE sales SET collection_status='recibido',payment_condition='Mercado Pago - pagado',updated_at=now() WHERE empresa_id=$1 AND id=$2::uuid`,[session.companyId,order.orderId]);
      }
    }
    await client.query(
      `INSERT INTO storefront_events (empresa_id,session_id,event_type,channel,request_id,metadata)
       VALUES ($1,gen_random_uuid(),'request_approved',$2,$3::uuid,jsonb_build_object('orderId',$4::text))`,
      [session.companyId,request.channel,requestId,order.orderId]);
  });
  return order;
}

export async function rejectOrderRequest(session: AuthSession, requestId: string, reason: string) {
  const result = await queryWithCompanyContext(session.companyId,
    `UPDATE order_requests SET status='rechazada',rejected_by=$1::uuid,rejected_at=now(),rejection_reason=$2,updated_at=now()
      WHERE empresa_id=$3 AND id=$4::uuid AND status='solicitud'`,
    [session.userId,reason.trim().slice(0,500) || "Revisión operativa",session.companyId,requestId], { cache:false });
  if (!result.rowCount) throw new ApiError(409,"La solicitud ya fue resuelta o no existe");
}

export async function storefrontDashboard(companyId:number, days=30) {
  const [result,channels,abandoned,recent] = await Promise.all([queryWithCompanyContext<{
    views:string; unique_sessions:string; checkout_started:string; requests:string; incomplete:string;
    approved:string; sales_amount:string; pending:string; challenge_pending:string;
  }>(companyId, `
    WITH e AS (
      SELECT * FROM storefront_events WHERE empresa_id=$1 AND created_at >= now()-($2::int||' days')::interval
    ), r AS (
      SELECT * FROM order_requests WHERE empresa_id=$1 AND created_at >= now()-($2::int||' days')::interval
    ) SELECT
      (SELECT count(*) FROM e WHERE event_type='page_view')::text views,
      (SELECT count(DISTINCT session_id) FROM e WHERE event_type='page_view')::text unique_sessions,
      (SELECT count(DISTINCT session_id) FROM e WHERE event_type='checkout_started')::text checkout_started,
      (SELECT count(*) FROM r)::text requests,
      (SELECT count(*) FROM storefront_checkout_sessions WHERE empresa_id=$1 AND status IN ('iniciada','en_progreso') AND last_activity_at >= now()-($2::int||' days')::interval)::text incomplete,
      (SELECT count(*) FROM r WHERE status='aprobada')::text approved,
      COALESCE((SELECT sum(s.total_amount) FROM r JOIN sales s ON s.id=r.approved_order_id WHERE r.status='aprobada'),0)::text sales_amount,
      (SELECT count(*) FROM r WHERE status='solicitud')::text pending,
      (SELECT count(*) FROM r WHERE status='solicitud' AND channel='desafio')::text challenge_pending`,
    [companyId,days], { cache:false }),queryWithCompanyContext<{channel:OrderRequestChannel;views:string;checkouts:string;incomplete:string;requests:string;approved:string;sales_amount:string}>(companyId,`
      WITH channels(channel) AS (VALUES ('tienda'),('desafio'),('portal'))
      SELECT c.channel::text channel,
        (SELECT count(*) FROM storefront_events e WHERE e.empresa_id=$1 AND e.channel=c.channel AND e.event_type='page_view' AND e.created_at>=now()-($2::int||' days')::interval)::text views,
        (SELECT count(*) FROM storefront_checkout_sessions s WHERE s.empresa_id=$1 AND s.channel=c.channel AND s.started_at>=now()-($2::int||' days')::interval)::text checkouts,
        (SELECT count(*) FROM storefront_checkout_sessions s WHERE s.empresa_id=$1 AND s.channel=c.channel AND s.status IN ('iniciada','en_progreso') AND s.last_activity_at>=now()-($2::int||' days')::interval)::text incomplete,
        (SELECT count(*) FROM order_requests r WHERE r.empresa_id=$1 AND r.channel=c.channel AND r.created_at>=now()-($2::int||' days')::interval)::text requests,
        (SELECT count(*) FROM order_requests r WHERE r.empresa_id=$1 AND r.channel=c.channel AND r.status='aprobada' AND r.created_at>=now()-($2::int||' days')::interval)::text approved,
        COALESCE((SELECT sum(s.total_amount) FROM order_requests r JOIN sales s ON s.id=r.approved_order_id AND s.empresa_id=r.empresa_id WHERE r.empresa_id=$1 AND r.channel=c.channel AND r.status='aprobada' AND r.created_at>=now()-($2::int||' days')::interval),0)::text sales_amount
      FROM channels c`,[companyId,days],{cache:false}),queryWithCompanyContext<{session_id:string;channel:OrderRequestChannel;status:string;contact_name:string;contact_phone:string;contact_email:string;business_name:string;business_type:string;delivery_address:string;item_count:string;estimated_amount:string;started_at:string;last_activity_at:string;cart_snapshot:unknown}>(companyId,`
      SELECT session_id::text,channel,status,contact_name,contact_phone,contact_email,business_name,business_type,delivery_address,item_count::text,estimated_amount::text,started_at::text,last_activity_at::text,cart_snapshot
      FROM storefront_checkout_sessions WHERE empresa_id=$1 AND status IN ('iniciada','en_progreso')
        AND last_activity_at>=now()-($2::int||' days')::interval ORDER BY last_activity_at DESC LIMIT 100`,[companyId,days],{cache:false}),queryWithCompanyContext<{day:string;views:string;checkouts:string;requests:string}>(companyId,`
      WITH days AS (SELECT generate_series(CURRENT_DATE-LEAST($2::int-1,29),CURRENT_DATE,'1 day')::date day)
      SELECT d.day::text,
        (SELECT count(*) FROM storefront_events e WHERE e.empresa_id=$1 AND e.event_type='page_view' AND e.created_at::date=d.day)::text views,
        (SELECT count(*) FROM storefront_checkout_sessions s WHERE s.empresa_id=$1 AND s.started_at::date=d.day)::text checkouts,
        (SELECT count(*) FROM order_requests r WHERE r.empresa_id=$1 AND r.created_at::date=d.day)::text requests
      FROM days d ORDER BY d.day`,[companyId,days],{cache:false})]);
  const row=result.rows[0]!;
  const metrics=Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Number(v)])) as Record<keyof typeof row,number>;
  return {...metrics,channels:channels.rows.map(item=>({...item,views:Number(item.views),checkouts:Number(item.checkouts),incomplete:Number(item.incomplete),requests:Number(item.requests),approved:Number(item.approved),salesAmount:Number(item.sales_amount)})),abandoned:abandoned.rows.map(item=>({...item,itemCount:Number(item.item_count),estimatedAmount:Number(item.estimated_amount)})),recent:recent.rows.map(item=>({...item,views:Number(item.views),checkouts:Number(item.checkouts),requests:Number(item.requests)}))};
}
