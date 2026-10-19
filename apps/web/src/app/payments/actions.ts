"use server";

import { revalidatePath } from "next/cache";
import { applyCustomerCredit, customerPaymentFromBody, registerCustomerPayment, voidCustomerPayment } from "@/lib/customer-accounts";
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

export async function registerCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
  await registerCustomerPayment(session, customerPaymentFromBody(Object.fromEntries(formData.entries())));
  revalidatePaymentsFlow();
  revalidatePath(`/payments/accounts/${String(formData.get("clientId") ?? "")}`);
}

export async function applyCustomerCreditAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_APPROVE_PERMISSION]);
  const clientId = uuidParam(String(formData.get("clientId") ?? ""), "Cliente");
  let allocations;
  try { allocations = JSON.parse(String(formData.get("allocations") ?? "[]")); }
  catch { throw new Error("La imputación de crédito no es válida"); }
  await applyCustomerCredit(session, {
    clientId, sourceId: String(formData.get("sourceId") ?? ""),
    requestId: String(formData.get("requestId") ?? ""), allocations,
  });
  revalidatePaymentsFlow();
  revalidatePath(`/payments/accounts/${clientId}`);
}

export async function voidCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_APPROVE_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Pago");
  await voidCustomerPayment(session, id);
  revalidatePaymentsFlow();
}
