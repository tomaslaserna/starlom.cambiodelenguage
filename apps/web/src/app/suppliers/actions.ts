"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupplier, supplierInputFromBody } from "@/lib/catalog-management";
import { stringFieldsFromFormData } from "@/lib/storage";
import { requireApiSession } from "@/lib/route-auth";

export async function createSupplierAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "proveedores", action: "crear" }]);
  await createSupplier(session.companyId, supplierInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/suppliers");
  redirect("/suppliers?created=1");
}
