import { after } from "next/server";
import { ApiError,handleApiError,ok } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";
import { supervisorAiEnabled } from "@/lib/supervisor-lab/availability";
import { parseSupervisorRequestBody } from "@/lib/supervisor-lab/request-guard";
import { compactSupervisorMessages } from "@/lib/supervisor-lab/message-compact";
import { clearSupervisorChatMemory,getSupervisorChatMemory,SUPERVISOR_MEMORY_HOURS } from "@/lib/supervisor-lab/chat-memory";
import { cancelDotQuestion,dispatchDotQuestions,dotConnected,pendingDotRequest,queueDotQuestion } from "@/lib/supervisor-lab/dot-store";
import type { StarlimSupervisorMessage } from "@/lib/supervisor-lab/agent";

export const runtime="nodejs";
export const maxDuration=60;
async function requireSupervisorReadPermission() {
  const session=await requireApiSession();
  if(!supervisorAiEnabled()) throw new ApiError(404,"LA TIRRA no está habilitada");
  return session;
}
export async function GET() {
  try {
    const session=await requireSupervisorReadPermission();
    const [messages,pending,connected]=await Promise.all([getSupervisorChatMemory(session),pendingDotRequest(session),dotConnected(session)]);
    if(pending) after(()=>dispatchDotQuestions(session));
    return ok({messages,pending:pending?{id:pending.id,delivered:Boolean(pending.delivered_at)}:null,connected,memoryHours:SUPERVISOR_MEMORY_HOURS});
  } catch(error) {return handleApiError(error);}
}
export async function POST(request:Request) {
  try {
    const session=await requireSupervisorReadPermission();
    if(Number(request.headers.get("content-length")??0)>65000) throw new ApiError(413,"Solicitud demasiado grande");
    const body=await request.json().catch(()=>null);
    const messages=compactSupervisorMessages(parseSupervisorRequestBody(body) as StarlimSupervisorMessage[]);
    const queued=await queueDotQuestion(session,messages);
    after(()=>dispatchDotQuestions(session));
    return ok({requestId:queued.id,state:queued.state},202);
  } catch(error) {return handleApiError(error);}
}
export async function PATCH() {
  try {const session=await requireSupervisorReadPermission();await cancelDotQuestion(session);return ok({cancelled:true});}
  catch(error) {return handleApiError(error);}
}
export async function DELETE() {
  try {const session=await requireSupervisorReadPermission();await cancelDotQuestion(session);await clearSupervisorChatMemory(session);return ok({cleared:true});}
  catch(error) {return handleApiError(error);}
}
