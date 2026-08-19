"use server";

import { revalidatePath } from "next/cache";
import { assertVendorOwnsClient } from "@/lib/crm";
import { customerPaymentFromBody, registerCustomerPayment } from "@/lib/customer-accounts";
import { uuidParam } from "@/lib/request-body";
import { CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function registerCrmCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const clientId = uuidParam(String(formData.get("clientId") ?? ""), "Cliente");
  await assertVendorOwnsClient(session, clientId);
  const input = customerPaymentFromBody(Object.fromEntries(formData.entries()));
  await registerCustomerPayment(session, { ...input, clientId });
  revalidatePath("/crm/cobros");
  revalidatePath("/admin/approvals");
}
