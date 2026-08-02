"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptQuote, createQuote, quoteInputFromBody } from "@/lib/quotes";
import type { CreateQuoteState } from "@/lib/quote-form-state";
import { requireApiSession } from "@/lib/route-auth";

export async function acceptQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "aprobar" }]);
  const id = String(formData.get("id") ?? "").trim();
  const requestFiscalInvoice = String(formData.get("requestFiscalInvoice") ?? "") === "true";
  const result = await acceptQuote(session, id, { requestFiscalInvoice });
  revalidatePath("/quotes");
  revalidatePath("/orders");
  revalidatePath("/billing");
  const fiscal = result.fiscalRequested ? "&fiscal=solicitada" : "";
  redirect(`/orders?status=cargado&created=remito${fiscal}`);
}

export async function createQuoteAction(
  _prev: CreateQuoteState,
  formData: FormData,
): Promise<CreateQuoteState> {
  const session = await requireApiSession([{ resource: "presupuestos", action: "crear" }]);
  try {
    await createQuote(session, quoteInputFromBody(Object.fromEntries(formData.entries())));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo crear el presupuesto" };
  }
  revalidatePath("/quotes");
  // nonce lets the client detect a fresh success and reset the form once.
  return { ok: true, nonce: Date.now() };
}
