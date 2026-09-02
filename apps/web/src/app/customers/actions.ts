"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCustomer,
  customerInputFromBody,
  getCustomer,
  updateCustomer,
  updateCustomerReceiptType,
} from "@/lib/catalog-management";
import { deleteCustomer, mergeCustomers } from "@/lib/customer-admin";
import { stringFieldsFromFormData } from "@/lib/storage";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

const CLIENTES_ELIMINAR = { resource: "clientes", action: "eliminar" } as const;

export async function createCustomerAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "crear" }]);
  await createCustomer(session.companyId, customerInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/customers");
  revalidatePath("/crm/clientes");
  const returnTo = String(formData.get("returnTo") ?? "");
  redirect(returnTo.startsWith("/crm/") ? returnTo : "/customers?created=1");
}

export async function updateCustomerAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cliente");
  const current = await getCustomer(session.companyId, id);
  await updateCustomer(
    session.companyId,
    id,
    customerInputFromBody(stringFieldsFromFormData(formData), {
      name: current.name,
      businessName: current.businessName,
      taxIdType: current.taxIdType,
      taxId: current.taxId,
      vatCondition: current.vatCondition,
      phone: current.phone,
      address: current.address,
      city: current.city,
      province: current.province,
      priceList: current.priceList,
      receiptType: current.receiptType,
      status: current.status,
      seller: current.seller,
      assignedSeller: current.assignedSeller,
      observation: current.observation,
    }),
  );
  revalidatePath("/customers");
}

export async function updateCustomerReceiptTypeAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
  const fields = stringFieldsFromFormData(formData);
  await updateCustomerReceiptType(
    session.companyId,
    uuidParam(fields.id, "Cliente"),
    fields.receiptType ?? "",
  );
  revalidatePath("/customers");
  revalidatePath("/orders");
  revalidatePath("/orders/new");
}

export async function deleteCustomerAction(formData: FormData) {
  const session = await requireApiSession([CLIENTES_ELIMINAR]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cliente");
  await deleteCustomer(session.companyId, id);
  revalidatePath("/customers");
  // La acción se dispara desde la ficha del cliente eliminado: esa ruta ya no
  // existe, así que volvemos a la lista para no caer en un 404.
  redirect("/customers?deleted=1");
}

export async function mergeCustomersAction(formData: FormData) {
  const session = await requireApiSession([CLIENTES_ELIMINAR]);
  const keepId = uuidParam(String(formData.get("keepId") ?? ""), "Cliente");
  const duplicateId = uuidParam(String(formData.get("duplicateId") ?? ""), "Cliente duplicado");
  await mergeCustomers(session.companyId, keepId, duplicateId);
  revalidatePath("/customers");
  // El duplicado (la ficha desde donde se fusiona) queda eliminado: redirigimos
  // al cliente que se conserva en vez de recargar una ruta inexistente (404).
  redirect(`/customers/${keepId}`);
}
