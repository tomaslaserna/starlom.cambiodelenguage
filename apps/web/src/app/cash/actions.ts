"use server";

import { revalidatePath } from "next/cache";
import { cashMovementInputFromBody, createCashMovement } from "@/lib/finance";
import { stringFieldsFromFormData } from "@/lib/storage";
import { ADMIN_TREASURY_WRITE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function createCashMovementAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_TREASURY_WRITE_PERMISSION]);
  await createCashMovement(session, cashMovementInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/cash");
}
