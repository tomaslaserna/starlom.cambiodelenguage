"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { manualStockInputFromBody, recordManualStockMovement } from "@/lib/inventory";
import { requireApiSession, STOCK_EDIT_PERMISSION } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

export async function createStockMovementAction(formData: FormData) {
  const session = await requireApiSession([STOCK_EDIT_PERMISSION]);
  let result: Awaited<ReturnType<typeof recordManualStockMovement>>;
  try {
    result = await recordManualStockMovement(session, manualStockInputFromBody(stringFieldsFromFormData(formData)));
  } catch (error) {
    if (error instanceof ApiError) redirect(`/stock?error=${encodeURIComponent(error.message)}`);
    throw error;
  }

  revalidatePath("/stock");
  revalidatePath("/products");
  const status = result.duplicate ? "duplicate" : result.changed ? "created" : "unchanged";
  redirect(`/stock?status=${status}`);
}
