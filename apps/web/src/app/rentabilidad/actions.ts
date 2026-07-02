"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import {
  createOperatingCost,
  deleteOperatingCost,
  operatingCostInputFromBody,
} from "@/lib/profitability";
import { requireAdminApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

function monthRedirect(formData: FormData): string {
  const month = String(formData.get("month") ?? "");
  return /^\d{4}-\d{2}$/.test(month) ? `/rentabilidad?month=${month}` : "/rentabilidad";
}

export async function createOperatingCostAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await createOperatingCost(session.companyId, operatingCostInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/rentabilidad");
  redirect(monthRedirect(formData));
}

export async function deleteOperatingCostAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) throw new ApiError(400, "Costo invalido");
  await deleteOperatingCost(session.companyId, id);
  revalidatePath("/rentabilidad");
  redirect(monthRedirect(formData));
}
