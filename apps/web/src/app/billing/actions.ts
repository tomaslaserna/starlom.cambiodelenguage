"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSalesNote, salesNoteInputFromBody } from "@/lib/sales-documents";
import { requireApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

export async function createSalesNoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "ventas", action: "crear" }]);
  await createSalesNote(session, salesNoteInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/billing");
  revalidatePath("/sales");
  redirect("/billing?created=note");
}
