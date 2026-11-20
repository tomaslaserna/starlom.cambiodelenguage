"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { createSupplier, supplierInputFromBody, updateSupplier } from "@/lib/catalog-management";
import { uuidParam } from "@/lib/request-body";
import { stringFieldsFromFormData } from "@/lib/storage";
import { requireApiSession } from "@/lib/route-auth";

export type SupplierEditState = {
  status: "idle" | "error";
  message: string;
};

export async function createSupplierAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "proveedores", action: "crear" }]);
  await createSupplier(session.companyId, supplierInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/suppliers");
  redirect("/suppliers?created=1");
}

export async function updateSupplierAction(
  _previousState: SupplierEditState,
  formData: FormData,
): Promise<SupplierEditState> {
  let id = "";
  try {
    const session = await requireApiSession([{ resource: "proveedores", action: "editar" }]);
    id = uuidParam(String(formData.get("id") ?? ""), "Proveedor");
    const fields = stringFieldsFromFormData(formData);
    await updateSupplier(session, id, supplierInputFromBody(fields));
  } catch (error) {
    if (error instanceof ApiError) return { status: "error", message: error.message };
    console.error("[suppliers] update failed", { id, error });
    return { status: "error", message: "No se pudo actualizar el proveedor." };
  }

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  redirect(`/suppliers/${id}?updated=1`);
}
