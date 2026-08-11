import { ApiError } from "@/lib/api-response";
import { createCustomer } from "@/lib/catalog-management";
import { sellerCandidates } from "@/lib/crm";
import { queryWithCompanyContext } from "@/lib/db";
import {
  ACTIVE_LEAD_STAGES,
  leadToCustomerInput,
  normalizeLeadStage,
  type Lead,
  type LeadInput,
  type LeadStage,
} from "@/lib/leads-domain";
import type { AuthSession } from "@/lib/auth";

type LeadRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  locality: string;
  source: string;
  stage: string;
  next_followup: string | null;
  notes: string;
  assigned_seller: string;
  converted_client_id: string | null;
  created_at: string;
};

const LEAD_COLUMNS = `
  id::text AS id, name, COALESCE(phone,'') AS phone, COALESCE(email,'') AS email,
  COALESCE(locality,'') AS locality, COALESCE(source,'') AS source, stage,
  next_followup::text AS next_followup, COALESCE(notes,'') AS notes,
  COALESCE(assigned_seller,'') AS assigned_seller,
  converted_client_id::text AS converted_client_id, created_at::text AS created_at
`;

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    email: row.email ?? "",
    locality: row.locality ?? "",
    source: row.source ?? "",
    stage: normalizeLeadStage(row.stage),
    nextFollowup: row.next_followup,
    notes: row.notes ?? "",
    assignedSeller: row.assigned_seller ?? "",
    convertedClientId: row.converted_client_id,
    createdAt: row.created_at,
  };
}

function sellerIdentity(session: AuthSession): string {
  return (session.displayName || session.username || "").trim();
}

export type VendorLeadsResult = {
  active: Record<string, Lead[]>;
  closed: Lead[];
  counts: Record<LeadStage, number>;
};

export async function getVendorLeads(session: AuthSession): Promise<VendorLeadsResult> {
  const candidates = sellerCandidates(session);
  const rows = (
    await queryWithCompanyContext<LeadRow>(
      session.companyId,
      `SELECT ${LEAD_COLUMNS}
         FROM crm_leads
        WHERE empresa_id = $1 AND UPPER(BTRIM(COALESCE(assigned_seller,''))) = ANY($2::text[])
        ORDER BY next_followup NULLS LAST, created_at DESC`,
      [session.companyId, candidates],
    )
  ).rows.map(mapLead);

  const active: Record<string, Lead[]> = { nuevo: [], contactado: [], interesado: [] };
  const closed: Lead[] = [];
  const counts: Record<LeadStage, number> = {
    nuevo: 0, contactado: 0, interesado: 0, convertido: 0, descartado: 0,
  };
  for (const lead of rows) {
    counts[lead.stage] += 1;
    if ((ACTIVE_LEAD_STAGES as readonly string[]).includes(lead.stage)) {
      active[lead.stage]!.push(lead);
    } else {
      closed.push(lead);
    }
  }
  return { active, closed, counts };
}

async function getScopedLead(session: AuthSession, id: string): Promise<Lead> {
  const candidates = sellerCandidates(session);
  const row = (
    await queryWithCompanyContext<LeadRow>(
      session.companyId,
      `SELECT ${LEAD_COLUMNS}
         FROM crm_leads
        WHERE id = $1::uuid AND empresa_id = $2
          AND UPPER(BTRIM(COALESCE(assigned_seller,''))) = ANY($3::text[])
        LIMIT 1`,
      [id, session.companyId, candidates],
    )
  ).rows[0];
  if (!row) throw new ApiError(404, "Lead no encontrado");
  return mapLead(row);
}

export async function createLead(session: AuthSession, input: LeadInput): Promise<{ id: string }> {
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `INSERT INTO crm_leads
       (empresa_id, assigned_seller, name, phone, email, locality, source, stage, next_followup, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'nuevo', $8, $9, $10)
     RETURNING id::text AS id`,
    [
      session.companyId,
      sellerIdentity(session),
      input.name,
      input.phone,
      input.email,
      input.locality,
      input.source,
      input.nextFollowup,
      input.notes,
      session.username,
    ],
  );
  return { id: result.rows[0]!.id };
}

export async function moveLeadStage(session: AuthSession, id: string, stage: LeadStage): Promise<void> {
  const allowed = (ACTIVE_LEAD_STAGES as readonly string[]).includes(stage) || stage === "descartado";
  if (!allowed) throw new ApiError(400, "Etapa inválida");
  await getScopedLead(session, id);
  await queryWithCompanyContext(
    session.companyId,
    `UPDATE crm_leads SET stage = $1, updated_at = now() WHERE id = $2::uuid AND empresa_id = $3`,
    [stage, id, session.companyId],
  );
}

export async function discardLead(session: AuthSession, id: string): Promise<void> {
  await moveLeadStage(session, id, "descartado");
}

export async function convertLeadToClient(session: AuthSession, id: string): Promise<{ clientId: string }> {
  const lead = await getScopedLead(session, id);
  if (lead.stage === "convertido" && lead.convertedClientId) {
    return { clientId: lead.convertedClientId };
  }
  const client = await createCustomer(session.companyId, leadToCustomerInput(lead));
  await queryWithCompanyContext(
    session.companyId,
    `UPDATE crm_leads
        SET stage='convertido', converted_client_id = $1::uuid, updated_at = now()
      WHERE id = $2::uuid AND empresa_id = $3`,
    [client.id, id, session.companyId],
  );
  return { clientId: client.id };
}
