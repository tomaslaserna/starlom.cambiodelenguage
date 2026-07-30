"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createDeliveryDocumentFromSale } from "@/lib/deliveries";
import { acceptQuote, createQuote, quoteInputFromBody } from "@/lib/quotes";
import type { CreateQuoteState } from "@/lib/quote-form-state";
import { requireApiSession } from "@/lib/route-auth";

export async function acceptQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "aprobar" }]);
  const id = String(formData.get("id") ?? "").trim();
  await acceptQuote(session, id);
  revalidatePath("/quotes");
  revalidatePath("/orders");
}

export async function acceptQuoteAndRemitAction(formData: FormData) {
  const session = await requireApiSession([
    { resource: "presupuestos", action: "aprobar" },
    { resource: "ventas", action: "editar" },
  ]);
  const id = String(formData.get("id") ?? "").trim();
  const result = await acceptQuote(session, id);
  await createDeliveryDocumentFromSale(session, result.orderId);
  revalidatePath("/quotes");
  revalidatePath("/orders");
  revalidatePath("/billing");
  redirect("/billing?tipo_factura=remito&created=remito");
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
