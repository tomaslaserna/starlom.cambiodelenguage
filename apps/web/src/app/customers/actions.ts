"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCustomer, customerInputFromBody } from "@/lib/catalog-management";
import { stringFieldsFromFormData } from "@/lib/storage";
import { requireApiSession } from "@/lib/route-auth";

export async function createCustomerAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "crear" }]);
  await createCustomer(session.companyId, customerInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/customers");
  redirect("/customers?created=1");
}
