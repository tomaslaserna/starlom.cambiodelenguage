"use server";

import { revalidatePath } from "next/cache";
import { createEmployee } from "@/lib/employees";
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
