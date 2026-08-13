"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptQuote, createQuote, deleteQuote, quoteInputFromBody, updateQuote } from "@/lib/quotes";
import type { CreateQuoteState } from "@/lib/quote-form-state";
import { requireApiSession } from "@/lib/route-auth";

export async function acceptQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "aprobar" }]);
  const id = String(formData.get("id") ?? "").trim();
  const requestFiscalInvoice = String(formData.get("requestFiscalInvoice") ?? "") === "true";
  let result;
  try {
    result = await acceptQuote(session, id, { requestFiscalInvoice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo aprobar el presupuesto";
    redirect(`/quotes?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/quotes");
  revalidatePath("/orders");
  revalidatePath("/billing");
  const fiscal = result.fiscalRequested ? "&fiscal=solicitada" : "";
  redirect(`/orders?status=cargado&created=remito${fiscal}`);
}

export async function acceptQuoteAndRemitAction(formData: FormData) {
  const session = await requireApiSession([
    { resource: "presupuestos", action: "aprobar" },
    { resource: "ventas", action: "editar" },
  ]);
  const id = String(formData.get("id") ?? "").trim();
  await acceptQuote(session, id);
  revalidatePath("/quotes");
  revalidatePath("/orders");
  redirect("/orders?status=cargado");
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

export async function updateQuoteAction(
  _prev: CreateQuoteState,
  formData: FormData,
): Promise<CreateQuoteState> {
  const session = await requireApiSession([{ resource: "presupuestos", action: "editar" }]);
  const id = String(formData.get("quoteId") ?? "").trim();
  try {
    await updateQuote(session, id, quoteInputFromBody(Object.fromEntries(formData.entries())));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo actualizar el presupuesto" };
  }
  revalidatePath("/quotes");
  redirect("/quotes?updated=1");
}

export async function deleteQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "cancelar" }]);
  const id = String(formData.get("id") ?? "").trim();
  try {
    await deleteQuote(session.companyId, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar el presupuesto";
    redirect(`/quotes?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/quotes");
  redirect("/quotes?deleted=1");
}
