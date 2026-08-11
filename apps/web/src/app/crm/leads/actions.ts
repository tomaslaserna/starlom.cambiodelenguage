"use server";

import { revalidatePath } from "next/cache";
import {
  convertLeadToClient,
  createLead,
  discardLead,
  moveLeadStage,
} from "@/lib/leads";
import { leadInputFromBody, normalizeLeadStage } from "@/lib/leads-domain";
import { uuidParam } from "@/lib/request-body";
import { CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

function revalidateLeads() {
  revalidatePath("/crm/leads");
}

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
  await convertLeadToClient(session, id);
  revalidateLeads();
}
