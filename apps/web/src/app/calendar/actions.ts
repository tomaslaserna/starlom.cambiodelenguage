"use server";

import { revalidatePath } from "next/cache";
import { completeTask, completionInputFromBody, createTask } from "@/lib/messages";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

function formBody(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createCalendarTaskAction(formData: FormData) {
  const session = await requireApiSession();
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
