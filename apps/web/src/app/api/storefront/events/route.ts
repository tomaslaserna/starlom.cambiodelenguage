import { randomUUID } from "node:crypto";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";

const EVENTS=new Set(["page_view","catalog_open","checkout_started","checkout_updated","challenge_started"]);
function clean(value:unknown,max=180){return String(value??"").trim().replace(/\s+/g," ").slice(0,max)}
export async function POST(request:Request){try{
  const body=await request.json() as Record<string,unknown>; const eventType=String(body.eventType??"");
  if(!EVENTS.has(eventType)) throw new ApiError(400,"Evento inválido");
  const supplied=String(body.sessionId??""); const sessionId=/^[0-9a-f-]{36}$/i.test(supplied)?supplied:randomUUID();
  const requestedChannel=String(body.channel??"");
  const channel=requestedChannel==="desafio"||requestedChannel==="portal"?requestedChannel:"tienda";
  if(eventType==="checkout_started"||eventType==="checkout_updated"){
    const rawCart=Array.isArray(body.cart)?body.cart.slice(0,100):[];
    const cart=rawCart.flatMap((item)=>{if(!item||typeof item!=="object")return[];const row=item as Record<string,unknown>;const quantity=Math.max(0,Math.min(9999,Math.floor(Number(row.quantity)||0)));return quantity?[{productId:clean(row.productId,36),name:clean(row.name),quantity}]:[]});
    await queryWithCompanyContext(1,`INSERT INTO storefront_checkout_sessions
      (empresa_id,session_id,channel,status,contact_name,contact_phone,contact_email,business_name,business_type,delivery_address,item_count,estimated_amount,cart_snapshot)
      VALUES (1,$1::uuid,$2,CASE WHEN $3='' AND $4='' THEN 'iniciada' ELSE 'en_progreso' END,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      ON CONFLICT (empresa_id,session_id) DO UPDATE SET channel=EXCLUDED.channel,
        status=CASE WHEN storefront_checkout_sessions.status='enviada' THEN 'enviada' ELSE EXCLUDED.status END,
        contact_name=COALESCE(NULLIF(EXCLUDED.contact_name,''),storefront_checkout_sessions.contact_name),
        contact_phone=COALESCE(NULLIF(EXCLUDED.contact_phone,''),storefront_checkout_sessions.contact_phone),
        contact_email=COALESCE(NULLIF(EXCLUDED.contact_email,''),storefront_checkout_sessions.contact_email),
        business_name=COALESCE(NULLIF(EXCLUDED.business_name,''),storefront_checkout_sessions.business_name),
        business_type=COALESCE(NULLIF(EXCLUDED.business_type,''),storefront_checkout_sessions.business_type),
        delivery_address=COALESCE(NULLIF(EXCLUDED.delivery_address,''),storefront_checkout_sessions.delivery_address),
        item_count=EXCLUDED.item_count,estimated_amount=EXCLUDED.estimated_amount,cart_snapshot=EXCLUDED.cart_snapshot,last_activity_at=now()`,
      [sessionId,channel,clean(body.name),clean(body.phone,40),clean(body.email),clean(body.businessName),clean(body.businessType),clean(body.address,300),cart.reduce((sum,item)=>sum+item.quantity,0),Math.max(0,Number(body.estimatedAmount)||0),JSON.stringify(cart)],{cache:false});
  }
  if(eventType!=="checkout_updated") await queryWithCompanyContext(1,`INSERT INTO storefront_events (empresa_id,session_id,event_type,channel) VALUES (1,$1::uuid,$2,$3)`,[sessionId,eventType,channel],{cache:false});
  return ok({data:{sessionId}},201);
}catch(error){return handleApiError(error)}}
