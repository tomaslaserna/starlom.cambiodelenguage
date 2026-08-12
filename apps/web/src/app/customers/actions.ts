"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCustomer,
  customerInputFromBody,
  getCustomer,
  updateCustomer,
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
  redirect("/customers?created=1");
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
      status: current.status,
      seller: current.seller,
      assignedSeller: current.assignedSeller,
      observation: current.observation,
    }),
  );
  revalidatePath("/customers");
}

export async function deleteCustomerAction(formData: FormData) {
  const session = await requireApiSession([CLIENTES_ELIMINAR]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cliente");
  await deleteCustomer(session.companyId, id);
  revalidatePath("/customers");
}

export async function mergeCustomersAction(formData: FormData) {
  const session = await requireApiSession([CLIENTES_ELIMINAR]);
  const keepId = uuidParam(String(formData.get("keepId") ?? ""), "Cliente");
  const duplicateId = uuidParam(String(formData.get("duplicateId") ?? ""), "Cliente duplicado");
  await mergeCustomers(session.companyId, keepId, duplicateId);
  revalidatePath("/customers");
}
