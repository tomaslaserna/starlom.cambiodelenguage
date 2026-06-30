"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createDeliveryDocumentFromSale } from "@/lib/deliveries";
import { acceptQuote, createQuote, quoteInputFromBody } from "@/lib/quotes";
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

export async function createQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "crear" }]);
  await createQuote(session, quoteInputFromBody(Object.fromEntries(formData.entries())));
  revalidatePath("/quotes");
}
