"use server";

import { revalidatePath } from "next/cache";
import { createEmployee, deleteEmployeeAccess, toggleEmployeeStatus, updateEmployee } from "@/lib/employees";
import {
  createSalaryPlan,
  salaryPlanInputFromBody,
  setSalaryPlanActive,
  updateSalaryPlan,
} from "@/lib/finance";
import { ADMIN_SALARIES_WRITE_PERMISSION, requireApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

function salaryId(formData: FormData) {
  const id = Number(formData.get("salaryId"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("Configuración salarial inválida");
  return id;
}

function refreshEmployeeFinance() {
  revalidatePath("/employees");
  revalidatePath("/administration");
  revalidatePath("/balance");
  revalidatePath("/balance/remunerations");
  revalidatePath("/rentabilidad");
}

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

export async function createEmployeeSalaryAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_SALARIES_WRITE_PERMISSION]);
  await createSalaryPlan(session.companyId, salaryPlanInputFromBody(stringFieldsFromFormData(formData)));
  refreshEmployeeFinance();
}

export async function updateEmployeeSalaryAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_SALARIES_WRITE_PERMISSION]);
  await updateSalaryPlan(
    session.companyId,
    salaryId(formData),
    salaryPlanInputFromBody(stringFieldsFromFormData(formData)),
  );
  refreshEmployeeFinance();
}

export async function setEmployeeSalaryStatusAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_SALARIES_WRITE_PERMISSION]);
  await setSalaryPlanActive(session.companyId, salaryId(formData), String(formData.get("active")) === "true");
  refreshEmployeeFinance();
}
