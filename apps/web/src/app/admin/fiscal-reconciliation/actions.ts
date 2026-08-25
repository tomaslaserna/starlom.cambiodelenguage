"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApiSession } from "@/lib/route-auth";
import { cancelIncidentDuplicate, linkIncidentInvoice } from "@/lib/fiscal-reconciliation";

export async function reconcileFiscalIncidentAction(formData: FormData) {
  const action = String(formData.get("action") ?? "");
  const invoiceNumber = Number(formData.get("invoiceNumber"));
  try {
    const session = await requireApiSession();
    if (action === "link") await linkIncidentInvoice(session, invoiceNumber);
    else if (action === "cancel") await cancelIncidentDuplicate(session, invoiceNumber);
    else throw new Error("Accion invalida.");
    revalidatePath("/admin/fiscal-reconciliation");
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Error fiscal");
    redirect(`/admin/fiscal-reconciliation?error=${message}`);
  }
  redirect("/admin/fiscal-reconciliation");
}
