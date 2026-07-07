"use server";

import { revalidatePath } from "next/cache";
import { createEmployee, deleteEmployeeAccess, toggleEmployeeStatus, updateEmployee } from "@/lib/employees";
import { requireApiSession } from "@/lib/route-auth";

export async function createEmployeeAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "empleados", action: "crear" }]);

  await createEmployee(session, {
    name: formData.get("name"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
    title: formData.get("title"),
    role: formData.get("role"),
    permissionKeys: formData.getAll("permissionKeys"),
  });

  revalidatePath("/employees");
}

export async function updateEmployeeAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "empleados", action: "editar" }]);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Empleado invalido");

  await updateEmployee(session, id, {
    name: formData.get("name"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
    title: formData.get("title"),
    role: formData.get("role"),
    active: formData.get("active"),
    permissionKeys: formData.getAll("permissionKeys"),
  });

  revalidatePath("/employees");
}

export async function toggleEmployeeStatusAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "empleados", action: "editar" }]);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Empleado invalido");

  await toggleEmployeeStatus(session, id);
  revalidatePath("/employees");
}

export async function deleteEmployeeAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "empleados", action: "editar" }]);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Empleado invalido");
  if (formData.get("confirmDelete") !== "yes") throw new Error("Confirma el borrado del acceso");

  await deleteEmployeeAccess(session, id);
  revalidatePath("/employees");
}
