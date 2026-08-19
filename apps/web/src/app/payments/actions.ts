"use server";

import { revalidatePath } from "next/cache";
import { customerPaymentFromBody, registerCustomerPayment, voidCustomerPayment } from "@/lib/customer-accounts";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_APPROVE_PERMISSION, COLLECTIONS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

function revalidatePaymentsFlow() {
  revalidatePath("/payments");
  revalidatePath("/payments/accounts");
  revalidatePath("/admin/approvals");
}

export async function registerCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
  await registerCustomerPayment(session, customerPaymentFromBody(Object.fromEntries(formData.entries())));
  revalidatePaymentsFlow();
}

export async function voidCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_APPROVE_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Pago");
  await voidCustomerPayment(session, id);
  revalidatePaymentsFlow();
}
