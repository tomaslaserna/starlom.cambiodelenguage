import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { normalizeRole } from "@/lib/auth";
import { hasAllCustomerAccess, sellerCandidates, type CrmClient, type CrmClientsResult } from "@/lib/crm";
import { queryWithCompanyContext } from "@/lib/db";
import { localDateIso } from "@/lib/timezone";

export const SALES_ACTIVITY_OUTCOMES = [
  "sin_respuesta",
  "contactado",
  "interesado",
  "pedido_probable",
  "recuperado",
  "no_interesado",
] as const;

export type SalesActivityOutcome = (typeof SALES_ACTIVITY_OUTCOMES)[number];
export type RecommerceBucket = "contactar" | "riesgo" | "perdido";

export type PlannedContact = CrmClient & {
  bucket: RecommerceBucket;
  contactedToday: boolean;
  latestOutcome: SalesActivityOutcome | null;
  latestNotes: string;
  nextFollowup: string | null;
};

export type SalesActivityDashboard = {
  date: string;
  goals: Array<{ key: "total" | RecommerceBucket; label: string; completed: number; target: number }>;
  planned: PlannedContact[];
  todayActivities: Array<{
    id: string;
    customerName: string;
    outcome: SalesActivityOutcome;
    notes: string;
    occurredAt: string;
    nextFollowup: string | null;
  }>;
  recoveredThisWeek: number;
};

type ActivityRow = {
  id: string;
  customer_id: string | null;
  customer_name: string;
  outcome: SalesActivityOutcome;
  source_bucket: RecommerceBucket | null;
  notes: string;
  next_followup: string | null;
  occurred_at: string;
};

function requireSeller(session: AuthSession) {
  if (normalizeRole(session.role) !== "vendedor") {
    throw new ApiError(403, "El seguimiento comercial es exclusivo para vendedores");
  }
}

function dailyPlan(groups: CrmClientsResult["groups"]) {
  const buckets: RecommerceBucket[] = ["contactar", "riesgo", "perdido"];
  const queues = new Map(buckets.map((bucket) => [bucket, [...(groups[bucket] ?? [])]]));
  const plan: Array<CrmClient & { bucket: RecommerceBucket }> = [];

  while (plan.length < 8 && buckets.some((bucket) => (queues.get(bucket)?.length ?? 0) > 0)) {
    for (const bucket of buckets) {
      const queue = queues.get(bucket)!;
      const next = queue.shift();
      if (next) plan.push({ ...next, bucket });
      if (plan.length >= 8) break;
    }
  }
  return plan;
}

export async function getSalesActivityDashboard(
  session: AuthSession,
  clients: CrmClientsResult,
): Promise<SalesActivityDashboard> {
  requireSeller(session);
  const today = localDateIso();
  const result = await queryWithCompanyContext<ActivityRow>(
    session.companyId,
    `SELECT a.id::text,
            a.customer_id::text,
            COALESCE(c.display_name, 'Cliente') AS customer_name,
            a.outcome,
            a.source_bucket,
            a.notes,
            a.next_followup::text,
            a.occurred_at::text
       FROM crm_sales_activities a
       LEFT JOIN clients c ON c.id = a.customer_id AND c.empresa_id = a.empresa_id
      WHERE a.empresa_id = $1
        AND a.seller_id = $2::uuid
        AND a.occurred_at >= date_trunc('week', CURRENT_DATE)::timestamptz
      ORDER BY a.occurred_at DESC`,
    [session.companyId, session.userId],
    { cache: false },
  );

  const todayRows = result.rows.filter((row) => row.occurred_at.slice(0, 10) === today);
  const contactedIds = new Set(todayRows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)));
  const latestByCustomer = new Map<string, ActivityRow>();
  for (const row of result.rows) {
    if (row.customer_id && !latestByCustomer.has(row.customer_id)) latestByCustomer.set(row.customer_id, row);
  }

  const plan = dailyPlan(clients.groups);
  const plannedIds = new Set(plan.map((client) => client.customerId));
  const planned: PlannedContact[] = plan.map((client) => {
    const latest = latestByCustomer.get(client.customerId);
    return {
      ...client,
      contactedToday: contactedIds.has(client.customerId),
      latestOutcome: latest?.outcome ?? null,
      latestNotes: latest?.notes ?? "",
      nextFollowup: latest?.next_followup ?? null,
    };
  });

  const availableByBucket = (bucket: RecommerceBucket) => clients.groups[bucket]?.length ?? 0;
  const targetByBucket = {
    contactar: Math.min(3, availableByBucket("contactar")),
    riesgo: Math.min(3, availableByBucket("riesgo")),
    perdido: Math.min(2, availableByBucket("perdido")),
  };
  const completedByBucket = (bucket: RecommerceBucket) =>
    new Set(
      todayRows
        .filter((row) => row.source_bucket === bucket && row.customer_id && plannedIds.has(row.customer_id))
        .map((row) => row.customer_id),
    ).size;
  const totalTarget = targetByBucket.contactar + targetByBucket.riesgo + targetByBucket.perdido;
  const completedPlan = new Set(
    todayRows
      .filter((row) => row.customer_id && plannedIds.has(row.customer_id))
      .map((row) => row.customer_id),
  ).size;

  return {
    date: today,
    goals: [
      { key: "total", label: "Plan de hoy", completed: completedPlan, target: totalTarget },
      { key: "contactar", label: "Próximos", completed: completedByBucket("contactar"), target: targetByBucket.contactar },
      { key: "riesgo", label: "En riesgo", completed: completedByBucket("riesgo"), target: targetByBucket.riesgo },
      { key: "perdido", label: "A recuperar", completed: completedByBucket("perdido"), target: targetByBucket.perdido },
    ],
    planned,
    todayActivities: todayRows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      outcome: row.outcome,
      notes: row.notes,
      occurredAt: row.occurred_at,
      nextFollowup: row.next_followup,
    })),
    recoveredThisWeek: result.rows.filter((row) => row.outcome === "recuperado").length,
  };
}

export async function recordSalesActivity(session: AuthSession, input: {
  customerId: string;
  bucket: RecommerceBucket;
  outcome: SalesActivityOutcome;
  notes: string;
  nextFollowup: string | null;
}) {
  requireSeller(session);
  const candidates = sellerCandidates(session);
  const allCustomers = await hasAllCustomerAccess(session);
  const target = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `SELECT id::text
       FROM clients
      WHERE id = $1::uuid
        AND empresa_id = $2
        AND ($3::boolean OR UPPER(BTRIM(COALESCE(seller_name, ''))) = ANY($4::text[])
          OR UPPER(BTRIM(COALESCE(assigned_seller, ''))) = ANY($4::text[]))
      LIMIT 1`,
    [input.customerId, session.companyId, allCustomers, candidates],
    { cache: false },
  );
  if (!target.rows[0]) throw new ApiError(404, "Cliente no disponible para este vendedor");

  await queryWithCompanyContext(
    session.companyId,
    `INSERT INTO crm_sales_activities
       (empresa_id, seller_id, customer_id, activity_type, outcome, source_bucket, notes, next_followup)
     VALUES ($1, $2::uuid, $3::uuid,
       CASE WHEN $4 = 'perdido' THEN 'recuperacion' ELSE 'contacto' END,
       $5, $4, $6, $7::date)`,
    [session.companyId, session.userId, input.customerId, input.bucket, input.outcome, input.notes, input.nextFollowup],
  );
}
