"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { closeAdministrationMonth, reopenAdministrationMonth } from "@/lib/administration-closure";
import {
  cashMovementInputFromBody,
  createBankAccount,
  createBankStatementLine,
  createCashMovement,
  ignoreBankStatementLine,
  matchBankStatementLine,
} from "@/lib/finance";
import {
  createOperatingCost,
  createScheduledOperatingCost,
  deleteOperatingCost,
  operatingCostInputFromBody,
  scheduledOperatingCostInputFromBody,
  setOperatingCostMonthStatus,
  updateScheduledOperatingCost,
} from "@/lib/profitability";
import { purchaseIdFromParam, requestSupplierPaymentApproval, supplierPaymentFromBody } from "@/lib/purchases";
import {
  ADMIN_TREASURY_WRITE_PERMISSION,
  requireAdminApiSession,
  requireApiSession,
} from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

type AdministrationView = "results" | "treasury" | "obligations";

function selectedMonth(formData: FormData) {
  const month = String(formData.get("month") ?? "");
  return /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
}

function administrationUrl(view: AdministrationView, month: string, notice: string) {
  return `/administration?view=${view}&month=${month}&notice=${encodeURIComponent(notice)}`;
}

function refreshAdministration() {
  revalidatePath("/administration");
  revalidatePath("/balance");
  revalidatePath("/cash");
  revalidatePath("/rentabilidad");
  revalidatePath("/treasury/accounts-payable");
  revalidatePath("/treasury/cash-flow");
}

function numericId(formData: FormData, label: string) {
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) throw new ApiError(400, `${label} inválido`);
  return id;
}

export async function createAdministrationCostAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const month = selectedMonth(formData);
  await createScheduledOperatingCost(
    session.companyId,
    scheduledOperatingCostInputFromBody(stringFieldsFromFormData(formData)),
  );
  refreshAdministration();
  redirect(administrationUrl("results", month, "Costo programado guardado"));
}

export async function updateAdministrationCostAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const month = selectedMonth(formData);
  await updateScheduledOperatingCost(
    session.companyId,
    numericId(formData, "Costo"),
    scheduledOperatingCostInputFromBody(stringFieldsFromFormData(formData)),
  );
  refreshAdministration();
  redirect(administrationUrl("results", month, "Costo actualizado"));
}

export async function setAdministrationCostMonthAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const month = selectedMonth(formData);
  await setOperatingCostMonthStatus({
    companyId: session.companyId,
    userId: session.userId,
    costId: numericId(formData, "Costo"),
    month,
    included: String(formData.get("included") ?? "") === "true",
  });
  refreshAdministration();
  redirect(administrationUrl("results", month, "Vigencia mensual actualizada"));
}

export async function archiveAdministrationCostAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const month = selectedMonth(formData);
  await deleteOperatingCost(session.companyId, numericId(formData, "Costo"));
  refreshAdministration();
  redirect(administrationUrl("results", month, "Costo archivado sin borrar su historia"));
}

export async function createAdministrationMovementAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_TREASURY_WRITE_PERMISSION]);
  const month = selectedMonth(formData);
  await createCashMovement(session, cashMovementInputFromBody(stringFieldsFromFormData(formData)));
  refreshAdministration();
  redirect(administrationUrl("treasury", month, "Movimiento de tesorería registrado"));
}

export async function createAdministrationBankAccountAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_TREASURY_WRITE_PERMISSION]);
  const month = selectedMonth(formData);
  await createBankAccount(session, {
    name: String(formData.get("name") ?? ""),
    bank: String(formData.get("bank") ?? ""),
    currency: String(formData.get("currency") ?? "ARS"),
  });
  refreshAdministration();
  redirect(administrationUrl("treasury", month, "Cuenta bancaria agregada"));
}

export async function createAdministrationStatementLineAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_TREASURY_WRITE_PERMISSION]);
  const month = selectedMonth(formData);
  const movementType = String(formData.get("movementType") ?? "credit");
  await createBankStatementLine(session, {
    accountId: String(formData.get("accountId") ?? ""),
    date: String(formData.get("date") ?? ""),
    description: String(formData.get("description") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    movementType: movementType === "debit" ? "debit" : "credit",
    amount: Number(formData.get("amount")),
  });
  refreshAdministration();
  redirect(administrationUrl("treasury", month, "Movimiento de extracto agregado"));
}

export async function matchAdministrationStatementLineAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_TREASURY_WRITE_PERMISSION]);
  const month = selectedMonth(formData);
  await matchBankStatementLine(session, {
    lineId: String(formData.get("lineId") ?? ""),
    paymentId: String(formData.get("paymentId") ?? ""),
    amount: Number(formData.get("amount")),
    notes: String(formData.get("notes") ?? ""),
  });
  refreshAdministration();
  redirect(administrationUrl("treasury", month, "Movimiento conciliado"));
}

export async function ignoreAdministrationStatementLineAction(formData: FormData) {
  const session = await requireApiSession([ADMIN_TREASURY_WRITE_PERMISSION]);
  const month = selectedMonth(formData);
  await ignoreBankStatementLine(session, String(formData.get("lineId") ?? ""), String(formData.get("reason") ?? ""));
  refreshAdministration();
  redirect(administrationUrl("treasury", month, "Movimiento excluido con motivo registrado"));
}

export async function createAdministrationPayableAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const month = selectedMonth(formData);
  const body = stringFieldsFromFormData(formData);
  await createOperatingCost(
    session.companyId,
    operatingCostInputFromBody({
      concept: body.concept,
      amount: body.amount,
      date: body.date,
      category: "cuenta_por_pagar",
    }),
  );
  refreshAdministration();
  redirect(administrationUrl("obligations", month, "Obligación manual registrada"));
}

export async function scheduleAdministrationSupplierPaymentAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "compras", action: "editar" }]);
  const month = selectedMonth(formData);
  const id = purchaseIdFromParam(String(formData.get("id") ?? ""), "Compra");
  await requestSupplierPaymentApproval(
    session,
    id,
    supplierPaymentFromBody({
      amount: formData.get("amount"),
      date: formData.get("date"),
      notes: formData.get("notes") || "Programado desde Administración V2",
    }),
  );
  refreshAdministration();
  revalidatePath("/admin/approvals");
  redirect(administrationUrl("obligations", month, "Pago a proveedor programado"));
}

export async function closeAdministrationMonthAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const month = selectedMonth(formData);
  await closeAdministrationMonth(session, month, String(formData.get("notes") ?? ""));
  refreshAdministration();
  redirect(administrationUrl("results", month, "Período cerrado y fotografía gerencial guardada"));
}

export async function reopenAdministrationMonthAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const month = selectedMonth(formData);
  await reopenAdministrationMonth(session, month, String(formData.get("reason") ?? ""));
  refreshAdministration();
  redirect(administrationUrl("results", month, "Período reabierto; el cierre anterior quedó en el historial"));
}
