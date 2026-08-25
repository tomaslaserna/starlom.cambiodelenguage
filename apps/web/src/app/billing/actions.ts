"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeRole } from "@/lib/auth";
import { authorizeSaleCreditNote, authorizeSaleDebitNote, authorizeSaleFiscalDocument, rejectSaleFiscalDocument } from "@/lib/fiscal";
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

function assertCanResolveFiscalInvoice(role: string) {
  const normalized = normalizeRole(role);
  if (normalized !== "administrador" && normalized !== "jefe") {
    throw new Error("Solo Administrador o Jefe pueden resolver documentos fiscales.");
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
    const operationalDocumentIdRaw = String(formData.get("operationalDocumentId") ?? "").trim();
    const operationalDocumentId = operationalDocumentIdRaw ? uuidParam(operationalDocumentIdRaw, "Nota operativa") : "";

    if (kind === "credit_note") {
      await authorizeSaleCreditNote(session, saleId, reason, amount, operationalDocumentId);
    } else {
      await authorizeSaleDebitNote(session, saleId, reason, amount, operationalDocumentId);
    }
    revalidatePath("/billing");
    revalidatePath(`/billing/${route}/${saleId}`);
    revalidatePath("/sales");
    revalidatePath("/treasury/current-accounts");
  } catch (error) {
    const message = encodeURIComponent(actionErrorMessage(error).slice(0, 900));
    const documentQuery = String(formData.get("operationalDocumentId") ?? "").trim();
    redirect(`/billing/${route}/${fallbackId}?status=error&message=${message}${documentQuery ? `&documento=${encodeURIComponent(documentQuery)}` : ""}`);
  }

  const documentQuery = String(formData.get("operationalDocumentId") ?? "").trim();
  redirect(`/billing/${route}/${saleId}?status=approved${documentQuery ? `&documento=${encodeURIComponent(documentQuery)}` : ""}`);
}

export async function issueCreditNoteAction(formData: FormData) {
  return issueFiscalNoteAction(formData, "credit_note");
}

export async function issueDebitNoteAction(formData: FormData) {
  return issueFiscalNoteAction(formData, "debit_note");
}

export async function authorizeFiscalInvoiceAction(formData: FormData) {
  const rawSaleId = String(formData.get("saleId") ?? "");
  try {
    const session = await requireApiSession();
    assertCanResolveFiscalInvoice(session.role);
    const saleId = uuidParam(rawSaleId, "Venta");
    await authorizeSaleFiscalDocument(session, saleId);
    revalidatePath("/billing");
    revalidatePath("/sales");
  } catch (error) {
    const message = encodeURIComponent(actionErrorMessage(error).slice(0, 900));
    redirect(`/billing?arca=error&message=${message}`);
  }
  redirect("/billing?arca=approved");
}

export async function rejectFiscalInvoiceAction(formData: FormData) {
  const rawSaleId = String(formData.get("saleId") ?? "");
  try {
    const session = await requireApiSession();
    assertCanResolveFiscalInvoice(session.role);
    const saleId = uuidParam(rawSaleId, "Venta");
    const reason = String(formData.get("reason") ?? "Rechazado desde Fiscal").trim();
    await rejectSaleFiscalDocument(session, saleId, reason);
    revalidatePath("/billing");
    revalidatePath("/sales");
  } catch (error) {
    const message = encodeURIComponent(actionErrorMessage(error).slice(0, 900));
    redirect(`/billing?arca=error&message=${message}`);
  }
  redirect("/billing?arca=rejected");
}
