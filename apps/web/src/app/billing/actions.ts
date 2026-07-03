"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeRole } from "@/lib/auth";
import { authorizeSaleCreditNote, authorizeSaleDebitNote } from "@/lib/fiscal";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

type FiscalNoteActionKind = "credit_note" | "debit_note";

function actionErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "No se pudo emitir la nota fiscal.";
}

function assertCanIssueFiscalCreditNote(role: string) {
  const normalized = normalizeRole(role);
  if (normalized !== "administrador" && normalized !== "jefe") {
    throw new Error("Solo Administrador o Jefe pueden emitir notas fiscales.");
  }
}

function noteAmountFromFormData(formData: FormData) {
  const raw = String(formData.get("amount") ?? "").replace(",", ".").trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error("El monto de la nota debe ser mayor a cero.");
  return value;
}

async function issueFiscalNoteAction(formData: FormData, kind: FiscalNoteActionKind) {
  const rawSaleId = String(formData.get("saleId") ?? "");
  const fallbackId = rawSaleId || "venta";
  let saleId = "";
  const route = kind === "credit_note" ? "credit-note" : "debit-note";

  try {
    const session = await requireApiSession();
    assertCanIssueFiscalCreditNote(session.role);
    saleId = uuidParam(rawSaleId, "Venta");
    const reason = String(formData.get("reason") ?? "").trim();
    const amount = noteAmountFromFormData(formData);

    if (kind === "credit_note") {
      await authorizeSaleCreditNote(session, saleId, reason, amount);
    } else {
      await authorizeSaleDebitNote(session, saleId, reason, amount);
    }
    revalidatePath("/billing");
    revalidatePath(`/billing/${route}/${saleId}`);
    revalidatePath("/sales");
    revalidatePath("/treasury/current-accounts");
  } catch (error) {
    const message = encodeURIComponent(actionErrorMessage(error).slice(0, 900));
    redirect(`/billing/${route}/${fallbackId}?status=error&message=${message}`);
  }

  redirect(`/billing/${route}/${saleId}?status=approved`);
}

export async function issueCreditNoteAction(formData: FormData) {
  return issueFiscalNoteAction(formData, "credit_note");
}

export async function issueDebitNoteAction(formData: FormData) {
  return issueFiscalNoteAction(formData, "debit_note");
}
