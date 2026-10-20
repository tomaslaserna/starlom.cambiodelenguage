"use server";

import { revalidatePath } from "next/cache";
import { assertVendorOwnsClient } from "@/lib/crm";
import { registerCustomerPaymentFromForm } from "@/lib/customer-payment-form";
import { uuidParam } from "@/lib/request-body";
import { CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function registerCrmCustomerPaymentAction(formData: FormData) {
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
}
