"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { authorizeSaleCreditNote, authorizeSaleDebitNote } from "@/lib/fiscal";
import { createSalesNote, salesNoteInputFromBody } from "@/lib/sales-documents";
import { requireApiSession, SALES_OPERATE_PERMISSION } from "@/lib/route-auth";
import type { OrderEntryActionState } from "@/app/orders/order-entry-action-state";

export async function createSalesAdjustmentAction(
  _previousState: OrderEntryActionState,
  formData: FormData,
): Promise<OrderEntryActionState> {
  let className = "NC";
  let saleId = "";
  let operationalDocumentId = "";
  let requiresFiscal = false;
  let reason = "";
  try {
    const session = await requireApiSession([SALES_OPERATE_PERMISSION]);
    const input = salesNoteInputFromBody(Object.fromEntries(formData.entries()));
    className = input.className;
    saleId = input.saleId;
    reason = input.reason;
    input.remittanceId = "";
    input.fiscal = false;
    const note = await createSalesNote(session, input);
    operationalDocumentId = note.id;
    requiresFiscal = note.requiresFiscal;

    if (requiresFiscal) {
      if (className === "NC") {
        await authorizeSaleCreditNote(session, saleId, reason, note.amount, operationalDocumentId);
      } else {
        await authorizeSaleDebitNote(session, saleId, reason, note.amount, operationalDocumentId);
      }
    }
  } catch (error) {
    if (requiresFiscal && saleId && operationalDocumentId) {
      const route = className === "NC" ? "credit-note" : "debit-note";
      const message = encodeURIComponent(
        (error instanceof Error ? error.message : "No se pudo emitir la nota fiscal.").slice(0, 900),
      );
      redirect(
        `/billing/${route}/${saleId}?status=error&message=${message}&documento=${encodeURIComponent(operationalDocumentId)}`,
      );
    }
    if (!(error instanceof ApiError)) throw error;
    return { error: error.message.slice(0, 500) };
  }

  if (requiresFiscal) {
    const route = className === "NC" ? "credit-note" : "debit-note";
    redirect(
      `/billing/${route}/${saleId}?status=approved&documento=${encodeURIComponent(operationalDocumentId)}`,
    );
  }
  redirect(`/sales?message=${encodeURIComponent(className === "NC" ? "Devolucion registrada" : "Agregado registrado")}`);
}
