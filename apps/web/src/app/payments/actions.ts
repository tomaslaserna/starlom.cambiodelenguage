"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api-response";
import { voidCustomerPayment } from "@/lib/customer-accounts";
import { registerCustomerPaymentFromForm } from "@/lib/customer-payment-form";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_APPROVE_PERMISSION, COLLECTIONS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

function revalidatePaymentsFlow() {
  revalidatePath("/payments");
  revalidatePath("/payments/accounts");
  revalidatePath("/admin/approvals");
  revalidatePath("/collections");
  revalidatePath("/sales");
  revalidatePath("/balance");
  revalidatePath("/metrics");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/administration");
  revalidatePath("/cash");
  revalidatePath("/treasury");
}

export type RegisterCustomerPaymentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function registerCustomerPaymentAction(formData: FormData): Promise<RegisterCustomerPaymentResult> {
  try {
    const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
    await registerCustomerPaymentFromForm(session, formData);
    revalidatePaymentsFlow();
    revalidatePath(`/payments/accounts/${String(formData.get("clientId") ?? "")}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("[payments] customer payment registration failed", { error });
    return { ok: false, error: "No se pudo registrar el pago. Revisá los datos y volvé a intentar." };
  }
}

export async function voidCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_APPROVE_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Pago");
  await voidCustomerPayment(session, id);
  revalidatePaymentsFlow();
}
