"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { createSalesNote, salesNoteInputFromBody } from "@/lib/sales-documents";
import { ORDERS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";
import type { OrderEntryActionState } from "@/app/orders/order-entry-action-state";

export async function createSalesAdjustmentAction(
  _previousState: OrderEntryActionState,
  formData: FormData,
): Promise<OrderEntryActionState> {
  let className = "NC";
  try {
    const session = await requireApiSession([ORDERS_CREATE_PERMISSION, { resource: "ventas", action: "editar" }]);
    const input = salesNoteInputFromBody(Object.fromEntries(formData.entries()));
    className = input.className;
    input.remittanceId = "";
    input.fiscal = false;
    await createSalesNote(session, input);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { error: error.message.slice(0, 500) };
  }
  redirect(`/sales?message=${encodeURIComponent(className === "NC" ? "Devolucion registrada" : "Agregado registrado")}`);
}
