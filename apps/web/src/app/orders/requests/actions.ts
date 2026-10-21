"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiSession } from "@/lib/route-auth";
import { approveOrderRequest, rejectOrderRequest } from "@/lib/order-requests";
import { uuidParam } from "@/lib/request-body";
import { ApiError } from "@/lib/api-response";

export async function resolveOrderRequestAction(formData:FormData) {
  try {
    const session=await requireApiSession([{resource:"pedidos",action:"editar"}]);
    const id=uuidParam(String(formData.get("id")??""),"Solicitud");
    const intent=String(formData.get("intent")??"");
    if(intent==="approve") await approveOrderRequest(session,id);
    else await rejectOrderRequest(session,id,String(formData.get("reason")??""));
  } catch(error) {
    const message=encodeURIComponent(error instanceof ApiError ? error.message : "No se pudo resolver la solicitud");
    redirect(`/orders/requests?error=${message}`);
  }
  revalidatePath("/orders/requests"); revalidatePath("/orders"); revalidatePath("/store");
  redirect("/orders/requests?updated=1");
}
