"use server";

import { revalidatePath } from "next/cache";
import { acceptQuote } from "@/lib/quotes";
import { positiveId } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export async function acceptQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "aprobar" }]);
  const id = positiveId(String(formData.get("id") ?? ""), "Presupuesto");
  await acceptQuote(session.companyId, id);
  revalidatePath("/quotes");
}
