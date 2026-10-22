import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { assertVendorOwnsClient, sellerCandidates } from "@/lib/crm";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { localDateIso } from "@/lib/timezone";

export type SalesMissionKind = "lead" | "cliente" | "presupuesto" | "lista";

export type SalesMissionState = {
  missionKey: string;
  lastCompletedAt: string;
  nextFollowupOn: string;
  purchaseAfterCompletion: boolean;
};

export type SalesMissionStateMap = Record<string, SalesMissionState>;

type CompleteMissionInput = {
  missionKey: string;
  kind: SalesMissionKind;
  entityId: string;
  nextFollowupOn: string;
  notes?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSION_PREFIX: Record<SalesMissionKind, string> = {
  lead: "lead",
  cliente: "client",
  presupuesto: "quote",
  lista: "price-list",
};

function maxFollowupDate(today: string) {
  const date = new Date(`${today}T12:00:00-03:00`);
  date.setDate(date.getDate() + 366);
  return localDateIso(date);
}

function validateCompletion(input: CompleteMissionInput) {
  if (!UUID_PATTERN.test(input.entityId)) throw new ApiError(400, "Misión inválida");
  if (input.missionKey !== `${MISSION_PREFIX[input.kind]}-${input.entityId}`) {
    throw new ApiError(400, "La misión no coincide con su origen");
  }
  const today = localDateIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextFollowupOn)) {
    throw new ApiError(400, "Elegí una fecha de recontacto válida");
  }
  if (input.nextFollowupOn < today || input.nextFollowupOn > maxFollowupDate(today)) {
    throw new ApiError(400, "La fecha de recontacto debe estar entre hoy y los próximos 366 días");
  }
  if ((input.notes ?? "").trim().length > 500) throw new ApiError(400, "La nota es demasiado larga");
}

export async function getSalesMissionStates(session: AuthSession): Promise<SalesMissionStateMap> {
  const result = await queryWithCompanyContext<{
    mission_key: string;
    completed_at: string;
    next_followup_on: string;
    purchase_after_completion: boolean;
  }>(
    session.companyId,
    `WITH latest AS (
       SELECT DISTINCT ON (mission_key)
              mission_key, empresa_id, customer_id, completed_at, next_followup_on, id
         FROM sales_mission_completions
        WHERE empresa_id = $1 AND seller_id = $2::uuid
        ORDER BY mission_key, completed_at DESC, id DESC
     )
     SELECT latest.mission_key,
            latest.completed_at::text,
            latest.next_followup_on::text,
            EXISTS (
              SELECT 1
                FROM sales s
               WHERE latest.customer_id IS NOT NULL
                 AND s.empresa_id = latest.empresa_id
                 AND s.client_id = latest.customer_id
                 AND s.created_at > latest.completed_at
                 AND ${canonicalSalesSourceSql("s")}
                 AND ${normalizedOrderStatusSql("s")} <> 'cancelado'
            ) AS purchase_after_completion
       FROM latest`,
    [session.companyId, session.userId],
    { cache: false },
  );

  return Object.fromEntries(result.rows.map((row) => [row.mission_key, {
    missionKey: row.mission_key,
    lastCompletedAt: row.completed_at,
    nextFollowupOn: row.next_followup_on,
    purchaseAfterCompletion: row.purchase_after_completion,
  }]));
}

export async function completeSalesMission(session: AuthSession, input: CompleteMissionInput) {
  validateCompletion(input);
  const notes = (input.notes ?? "").trim();
  const candidates = sellerCandidates(session);

  if (input.kind === "cliente") await assertVendorOwnsClient(session, input.entityId);

  await withCompanyContext(session.companyId, async (client) => {
    let customerId: string | null = null;

    if (input.kind === "cliente") {
      customerId = input.entityId;
      const customer = await client.query<{ id: string }>(
        `SELECT id::text FROM clients WHERE id = $1::uuid AND empresa_id = $2 AND active = true LIMIT 1`,
        [input.entityId, session.companyId],
      );
      if (!customer.rows[0]) throw new ApiError(404, "Cliente no encontrado");
      await client.query(
        `INSERT INTO crm_sales_activities
           (empresa_id, seller_id, customer_id, activity_type, outcome, notes, next_followup)
         VALUES ($1, $2::uuid, $3::uuid, 'seguimiento', 'contactado', $4, $5::date)`,
        [session.companyId, session.userId, customerId, notes, input.nextFollowupOn],
      );
    }

    if (input.kind === "lead") {
      const lead = await client.query<{ id: string }>(
        `UPDATE crm_leads
            SET next_followup = $1::date, updated_at = NOW()
          WHERE id = $2::uuid AND empresa_id = $3
            AND UPPER(BTRIM(COALESCE(assigned_seller, ''))) = ANY($4::text[])
            AND stage IN ('nuevo', 'contactado', 'interesado')
          RETURNING id::text`,
        [input.nextFollowupOn, input.entityId, session.companyId, candidates],
      );
      if (!lead.rows[0]) throw new ApiError(404, "Prospecto no encontrado");
      await client.query(
        `INSERT INTO crm_sales_activities
           (empresa_id, seller_id, lead_id, activity_type, outcome, source_bucket, notes, next_followup)
         VALUES ($1, $2::uuid, $3::uuid, 'seguimiento', 'contactado', 'lead', $4, $5::date)`,
        [session.companyId, session.userId, input.entityId, notes, input.nextFollowupOn],
      );
    }

    if (input.kind === "presupuesto") {
      const quote = await client.query<{ customer_id: string | null }>(
        `SELECT client_id::text AS customer_id
           FROM quotes
          WHERE id = $1::uuid AND empresa_id = $2
            AND (seller_id = $3::uuid OR visible_to_all = true)
            AND status = 'pendiente'
          LIMIT 1`,
        [input.entityId, session.companyId, session.userId],
      );
      if (!quote.rows[0]) throw new ApiError(404, "Presupuesto pendiente no encontrado");
      customerId = quote.rows[0].customer_id;
    }

    if (input.kind === "lista") {
      const share = await client.query<{ customer_id: string | null }>(
        `UPDATE price_list_shares
            SET follow_up_on = $1::date, updated_at = NOW()
          WHERE id = $2::uuid AND empresa_id = $3 AND seller_id = $4::uuid
            AND status = 'pendiente'
          RETURNING customer_id::text`,
        [input.nextFollowupOn, input.entityId, session.companyId, session.userId],
      );
      if (!share.rows[0]) throw new ApiError(404, "Seguimiento de lista no encontrado");
      customerId = share.rows[0].customer_id;
    }

    await client.query(
      `INSERT INTO sales_mission_completions
         (empresa_id, seller_id, mission_key, mission_kind, entity_id,
          customer_id, next_followup_on, notes)
       VALUES ($1, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::date, $8)`,
      [
        session.companyId,
        session.userId,
        input.missionKey,
        input.kind,
        input.entityId,
        customerId,
        input.nextFollowupOn,
        notes,
      ],
    );
  });
}
