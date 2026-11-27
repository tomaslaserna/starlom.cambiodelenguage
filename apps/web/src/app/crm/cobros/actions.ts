"use server";

import { revalidatePath } from "next/cache";
import type { RegisterCustomerPaymentResult } from "@/app/payments/actions";
import { ApiError } from "@/lib/api-response";
import { assertVendorOwnsClient } from "@/lib/crm";
import { registerCustomerPaymentFromForm } from "@/lib/customer-payment-form";
import { uuidParam } from "@/lib/request-body";
import { CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function registerCrmCustomerPaymentAction(formData: FormData): Promise<RegisterCustomerPaymentResult> {
  try {
    const session = await requireApiSession([CRM_READ_PERMISSION]);
    const clientId = uuidParam(String(formData.get("clientId") ?? ""), "Cliente");
    await assertVendorOwnsClient(session, clientId);
    await registerCustomerPaymentFromForm(session, formData);
    revalidatePath("/payments/accounts");
    revalidatePath("/crm/cobros");
    revalidatePath("/admin/approvals");
    revalidatePath("/administration");
    revalidatePath("/cash");
    revalidatePath("/treasury");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("[crm] customer payment registration failed", { error });
    return { ok: false, error: "No se pudo registrar el pago. Revisá los datos y volvé a intentar." };
  }
}
