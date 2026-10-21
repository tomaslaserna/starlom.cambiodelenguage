import { randomUUID } from "node:crypto";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";

const EVENTS=new Set(["page_view","catalog_open","checkout_started","challenge_started"]);
export async function POST(request:Request){try{
  const body=await request.json() as Record<string,unknown>; const eventType=String(body.eventType??"");
  if(!EVENTS.has(eventType)) throw new ApiError(400,"Evento inválido");
  const supplied=String(body.sessionId??""); const sessionId=/^[0-9a-f-]{36}$/i.test(supplied)?supplied:randomUUID();
  const channel=String(body.channel??"")==="desafio"?"desafio":"tienda";
  await queryWithCompanyContext(1,`INSERT INTO storefront_events (empresa_id,session_id,event_type,channel) VALUES (1,$1::uuid,$2,$3)`,[sessionId,eventType,channel],{cache:false});
  return ok({data:{sessionId}},201);
}catch(error){return handleApiError(error)}}
