"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTask } from "@/lib/messages";
import { requireApiSession } from "@/lib/route-auth";

function formBody(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createCustomerFollowUpTaskAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "ver" }]);
  await createTask(session, formBody(formData));
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/customers/follow-up");
  redirect("/customers/follow-up?task=1");
}
