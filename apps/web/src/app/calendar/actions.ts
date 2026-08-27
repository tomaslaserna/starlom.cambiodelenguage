"use server";

import { revalidatePath } from "next/cache";
import { completeTask, completionInputFromBody, createTask } from "@/lib/messages";
import { positiveId, uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";
import { scheduleLeadReminder } from "@/lib/leads";

function formBody(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createCalendarTaskAction(formData: FormData) {
  const session = await requireApiSession();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (leadId) {
    const deadline = String(formData.get("deadline") ?? "").trim();
    const nextFollowup = deadline.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextFollowup)) {
      throw new Error("Seleccioná una fecha para programar el contacto del lead");
    }
    await scheduleLeadReminder(
      session,
      uuidParam(leadId, "Lead"),
      nextFollowup,
      String(formData.get("description") ?? "").trim().slice(0, 500),
    );
    revalidatePath("/crm/leads");
    revalidatePath("/crm/perfil");
    revalidatePath("/crm/calendario");
    return;
  }
  await createTask(session, formBody(formData));
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function completeCalendarTaskAction(formData: FormData) {
  const session = await requireApiSession();
  const id = positiveId(String(formData.get("id") ?? ""), "Tarea");
  await completeTask(session, id, completionInputFromBody({ message: String(formData.get("message") ?? "") }));
  revalidatePath("/");
  revalidatePath("/calendar");
}
