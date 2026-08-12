import { ApiError } from "@/lib/api-response";
import { textField, type RequestBody } from "@/lib/request-body";
import type { CustomerInput } from "@/lib/catalog-management";

export const LEAD_STAGES = ["nuevo", "contactado", "interesado", "convertido", "descartado"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const ACTIVE_LEAD_STAGES = ["nuevo", "contactado", "interesado"] as const;
export type ActiveLeadStage = (typeof ACTIVE_LEAD_STAGES)[number];

export function normalizeLeadStage(value: string): LeadStage {
  const normalized = value.trim().toLowerCase();
  return (LEAD_STAGES as readonly string[]).includes(normalized) ? (normalized as LeadStage) : "nuevo";
}

export type LeadInput = {
  name: string;
  phone: string;
  email: string;
  locality: string;
  source: string;
  nextFollowup: string | null;
  notes: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function leadInputFromBody(body: RequestBody): LeadInput {
  const name = textField(body, "name") || textField(body, "nombre");
  if (!name) throw new ApiError(400, "El nombre es obligatorio");

  const rawFollowup = textField(body, "nextFollowup") || textField(body, "proximo_seguimiento");
  let nextFollowup: string | null = null;
  if (rawFollowup) {
    if (!ISO_DATE.test(rawFollowup)) throw new ApiError(400, "La fecha de seguimiento no es válida");
    nextFollowup = rawFollowup;
  }

  return {
    name,
    phone: textField(body, "phone") || textField(body, "telefono"),
    email: textField(body, "email"),
    locality: textField(body, "locality") || textField(body, "localidad") || textField(body, "zona"),
    source: textField(body, "source") || textField(body, "origen"),
    nextFollowup,
    notes: textField(body, "notes") || textField(body, "notas"),
  };
}

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string;
  locality: string;
  source: string;
  stage: LeadStage;
  nextFollowup: string | null;
  notes: string;
  assignedSeller: string;
  convertedClientId: string | null;
  createdAt: string;
};

export function buildConversionNote(lead: Lead): string {
  const parts = ["Lead convertido."];
  if (lead.email) parts.push(`Email: ${lead.email}.`);
  if (lead.source) parts.push(`Origen: ${lead.source}.`);
  if (lead.notes) parts.push(lead.notes);
  return parts.join(" ");
}

export function leadToCustomerInput(lead: Lead, receiptType: string): CustomerInput {
  return {
    name: lead.name,
    businessName: "",
    taxIdType: "",
    taxId: "",
    vatCondition: "",
    phone: lead.phone,
    address: "",
    city: lead.locality,
    province: "",
    priceList: "",
    receiptType,
    status: "activo",
    seller: lead.assignedSeller,
    assignedSeller: lead.assignedSeller,
    observation: buildConversionNote(lead),
  };
}
