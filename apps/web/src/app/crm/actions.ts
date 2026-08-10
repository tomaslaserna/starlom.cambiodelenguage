"use server";

import { revalidatePath } from "next/cache";
import { scheduleClientReminder } from "@/lib/crm";
import { requireApiSession } from "@/lib/route-auth";
import { CRM_READ_PERMISSION } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";

export async function agendarClienteAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!customerName) return;

  // Manana a las 9:00 (dia calendario de Argentina).
  const tomorrow = localDateIso(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const sendAt = `${tomorrow} 09:00:00`;

  await scheduleClientReminder(session, { customerName, sendAt });
  revalidatePath("/crm/clientes");
}
