"use server";

import { revalidatePath } from "next/cache";
import { acceptQuote, createQuote, quoteInputFromBody } from "@/lib/quotes";
import { requireApiSession } from "@/lib/route-auth";

export async function acceptQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "aprobar" }]);
  const id = String(formData.get("id") ?? "").trim();
  await acceptQuote(session.companyId, id);
  revalidatePath("/quotes");
}

export async function createQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "crear" }]);
  await createQuote(
    session,
    quoteInputFromBody({
      customer: {
        name: formData.get("customerName"),
        businessName: formData.get("businessName"),
        taxId: formData.get("taxId"),
        vatCondition: formData.get("vatCondition"),
        phone: formData.get("phone"),
        address: formData.get("address"),
      },
      products: [
        {
          name: formData.get("productName"),
          quantity: formData.get("quantity"),
          unitPrice: formData.get("unitPrice"),
          discount: formData.get("discount"),
        },
      ],
      includeVat: formData.get("includeVat") === "on",
      validityDays: formData.get("validityDays"),
    }),
  );
  revalidatePath("/quotes");
}
