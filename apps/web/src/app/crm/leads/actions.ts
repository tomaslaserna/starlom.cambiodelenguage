"use server";

import { revalidatePath } from "next/cache";
import {
  convertLeadToClient,
  createLead,
  discardLead,
  moveLeadStage,
  recordLeadContact,
} from "@/lib/leads";
import { leadInputFromBody, normalizeLeadStage } from "@/lib/leads-domain";
import { uuidParam } from "@/lib/request-body";
import { CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";
import { recordSalesActivity, SALES_ACTIVITY_OUTCOMES, type RecommerceBucket } from "@/lib/sales-activity";

function revalidateLeads() {
  revalidatePath("/crm/leads");
  revalidatePath("/crm/perfil");
  revalidatePath("/supervisor-lab");
}

const RECOMMERCE_BUCKETS = new Set(["contactar", "riesgo", "perdido"]);

export async function createLeadAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  await createLead(session, leadInputFromBody(Object.fromEntries(formData.entries())));
  revalidateLeads();
}

export async function moveLeadStageAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Lead");
  await moveLeadStage(session, id, normalizeLeadStage(String(formData.get("stage") ?? "")));
  revalidateLeads();
}

export async function discardLeadAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Lead");
  await discardLead(session, id);
  revalidateLeads();
}

export async function convertLeadAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Lead");
  await convertLeadToClient(session, id, String(formData.get("receiptType") ?? ""));
  revalidateLeads();
}

export async function recordSalesActivityAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const customerId = uuidParam(String(formData.get("customerId") ?? ""), "Cliente");
  const bucket = String(formData.get("bucket") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const nextFollowup = String(formData.get("nextFollowup") ?? "").trim() || null;
  if (!RECOMMERCE_BUCKETS.has(bucket)) throw new Error("Categoría comercial inválida");
  if (!(SALES_ACTIVITY_OUTCOMES as readonly string[]).includes(outcome)) throw new Error("Resultado inválido");
  if (nextFollowup && !/^\d{4}-\d{2}-\d{2}$/.test(nextFollowup)) throw new Error("Fecha inválida");
  await recordSalesActivity(session, {
    customerId,
    bucket: bucket as RecommerceBucket,
    outcome: outcome as (typeof SALES_ACTIVITY_OUTCOMES)[number],
    notes: String(formData.get("notes") ?? "").trim().slice(0, 500),
    nextFollowup,
  });
  revalidateLeads();
}

export async function recordLeadContactAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Lead");
  const nextFollowup = String(formData.get("nextFollowup") ?? "").trim();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextFollowup) || nextFollowup <= today) {
    throw new Error("El próximo contacto debe ser una fecha futura");
  }
  await recordLeadContact(session, id, nextFollowup, String(formData.get("notes") ?? "").trim().slice(0, 500));
  revalidateLeads();
}
