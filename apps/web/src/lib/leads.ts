import { ApiError } from "@/lib/api-response";
import { createCustomer } from "@/lib/catalog-management";
import { sellerCandidates } from "@/lib/crm";
import { queryWithCompanyContext } from "@/lib/db";
import {
  ACTIVE_LEAD_STAGES,
  leadToCustomerInput,
  leadStageAfterContact,
  normalizeLeadStage,
  type Lead,
  type LeadInput,
  type LeadContactOutcome,
  type LeadStage,
} from "@/lib/leads-domain";
import type { AuthSession } from "@/lib/auth";
import { localDateIso } from "@/lib/timezone";

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
  business_segment: string;
};

const LEAD_COLUMNS = `
  id::text AS id, name, COALESCE(phone,'') AS phone, COALESCE(email,'') AS email,
  COALESCE(locality,'') AS locality, COALESCE(source,'') AS source, stage,
  next_followup::text AS next_followup, COALESCE(notes,'') AS notes,
  COALESCE(assigned_seller,'') AS assigned_seller,
  converted_client_id::text AS converted_client_id, created_at::text AS created_at,
  COALESCE(business_segment,'') AS business_segment
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
    businessSegment: row.business_segment ?? "",
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

export type LeadFollowupAgendaItem = Lead & {
  contactedToday: boolean;
  lastContactAt: string | null;
};

type LeadAgendaRow = LeadRow & {
  contacted_today: boolean;
  last_contact_at: string | null;
};

export async function getLeadFollowupAgenda(session: AuthSession): Promise<LeadFollowupAgendaItem[]> {
  const candidates = sellerCandidates(session);
  const today = localDateIso();
  const rows = await queryWithCompanyContext<LeadAgendaRow>(
    session.companyId,
    `WITH contacted_today AS (
       SELECT DISTINCT ON (lead_id) lead_id, occurred_at
         FROM crm_sales_activities
        WHERE empresa_id = $1 AND seller_id = $2::uuid AND lead_id IS NOT NULL
          AND occurred_at >= ($4::date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
        ORDER BY lead_id, occurred_at DESC
     )
     SELECT l.id::text AS id, l.name, COALESCE(l.phone,'') AS phone, COALESCE(l.email,'') AS email,
            COALESCE(l.locality,'') AS locality, COALESCE(l.source,'') AS source, l.stage,
            l.next_followup::text AS next_followup, COALESCE(l.notes,'') AS notes,
            COALESCE(l.assigned_seller,'') AS assigned_seller,
            l.converted_client_id::text AS converted_client_id, l.created_at::text AS created_at,
            (ct.lead_id IS NOT NULL) AS contacted_today,
            ct.occurred_at::text AS last_contact_at, COALESCE(l.business_segment,'') AS business_segment
       FROM crm_leads l
       LEFT JOIN contacted_today ct ON ct.lead_id = l.id
      WHERE l.empresa_id = $1
        AND UPPER(BTRIM(COALESCE(l.assigned_seller,''))) = ANY($3::text[])
        AND l.stage IN ('nuevo', 'contactado', 'interesado')
        AND (l.next_followup IS NULL OR l.next_followup <= $4::date)
      ORDER BY COALESCE(l.next_followup, l.created_at::date), l.created_at, l.id
      LIMIT 10`,
    [session.companyId, session.userId, candidates, today],
    { cache: false },
  );
  return rows.rows.map((row) => ({
    ...mapLead(row),
    contactedToday: row.contacted_today,
    lastContactAt: row.last_contact_at,
  }));
}

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
  const automaticFollowup = new Date(`${localDateIso()}T12:00:00-03:00`);
  automaticFollowup.setDate(automaticFollowup.getDate() + 3);
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `INSERT INTO crm_leads
       (empresa_id, assigned_seller, name, phone, email, locality, source, stage, next_followup, notes, created_by, business_segment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'nuevo', $8, $9, $10, NULLIF($11,''))
     RETURNING id::text AS id`,
    [
      session.companyId,
      sellerIdentity(session),
      input.name,
      input.phone,
      input.email,
      input.locality,
      input.source,
      input.nextFollowup ?? localDateIso(automaticFollowup),
      input.notes,
      session.username,
      input.businessSegment,
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

export async function recordLeadContact(
  session: AuthSession,
  id: string,
  nextFollowup: string,
  notes: string,
  outcome: LeadContactOutcome,
): Promise<void> {
  const lead = await getScopedLead(session, id);
  const nextStage = leadStageAfterContact(lead.stage, outcome);
  await queryWithCompanyContext(
    session.companyId,
    `WITH updated AS (
       UPDATE crm_leads
          SET stage = $6,
              next_followup = $1::date,
              notes = CASE WHEN $2 = '' THEN notes ELSE CONCAT_WS(E'\\n', NULLIF(notes, ''), $2) END,
              updated_at = now()
        WHERE id = $3::uuid AND empresa_id = $4
        RETURNING id
     )
     INSERT INTO crm_sales_activities
       (empresa_id, seller_id, lead_id, activity_type, outcome, source_bucket, notes, next_followup)
     SELECT $4, $5::uuid, id, 'seguimiento', $7, 'lead', $2, $1::date
       FROM updated`,
    [nextFollowup, notes, id, session.companyId, session.userId, nextStage, outcome],
  );
}

export async function scheduleLeadReminder(
  session: AuthSession,
  id: string,
  nextFollowup: string,
  notes: string,
): Promise<void> {
  await getScopedLead(session, id);
  await queryWithCompanyContext(
    session.companyId,
    `UPDATE crm_leads
        SET next_followup = $1::date,
            notes = CASE WHEN $2 = '' THEN notes ELSE CONCAT_WS(E'\\n', NULLIF(notes, ''), $2) END,
            updated_at = now()
      WHERE id = $3::uuid AND empresa_id = $4`,
    [nextFollowup, notes, id, session.companyId],
  );
}

export async function convertLeadToClient(
  session: AuthSession,
  id: string,
  receiptType: string,
): Promise<{ clientId: string }> {
  const lead = await getScopedLead(session, id);
  if (lead.stage === "convertido" && lead.convertedClientId) {
    return { clientId: lead.convertedClientId };
  }
  const client = await createCustomer(session.companyId, leadToCustomerInput(lead, receiptType));
  await queryWithCompanyContext(
    session.companyId,
    `UPDATE crm_leads
        SET stage='convertido', converted_client_id = $1::uuid, updated_at = now()
      WHERE id = $2::uuid AND empresa_id = $3`,
    [client.id, id, session.companyId],
  );
  return { clientId: client.id };
}
