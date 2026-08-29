import "server-only";

import type { AuthSession } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { getSupervisorOperationalSnapshot } from "@/lib/supervisor-lab/read-model";
import { buildSupervisorTaskCandidates } from "@/lib/supervisor-lab/task-rules";

export type SupervisorTaskStatus = "open" | "snoozed" | "done" | "dismissed";

export type SupervisorTask = {
  id: string;
  kind: string;
  entityType: string;
  entityId: string;
  title: string;
  detail: string;
  priority: string;
  status: SupervisorTaskStatus;
  evidence: Record<string, unknown>;
  dueAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
};

export function supervisorTasksEnabled() {
  return process.env.SUPERVISOR_TASKS_ENABLED === "true";
}

function assertTasksEnabled() {
  if (!supervisorTasksEnabled()) throw new ApiError(404, "Tareas de LA TIRRA ia.1.1 no habilitadas");
}

export async function listSupervisorTasks(session: AuthSession): Promise<SupervisorTask[]> {
  assertTasksEnabled();
  const result = await queryWithCompanyContext<{
    id: string;
    kind: string;
    entity_type: string;
    entity_id: string;
    title: string;
    detail: string;
    priority: string;
    status: SupervisorTaskStatus;
    evidence: Record<string, unknown>;
    due_at: string | null;
    snoozed_until: string | null;
    created_at: string;
  }>(
    session.companyId,
    `SELECT id::text, kind, entity_type, entity_id, title, detail, priority, status,
            evidence, due_at::text, snoozed_until::text, created_at::text
       FROM supervisor_tasks
      WHERE empresa_id = $1
        AND assignee_id = $2::uuid
        AND status IN ('open', 'snoozed')
        AND (status <> 'snoozed' OR snoozed_until IS NULL OR snoozed_until <= NOW())
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        due_at ASC NULLS LAST,
        created_at ASC
      LIMIT 100`,
    [session.companyId, session.userId],
    { cache: false },
  );
  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    detail: row.detail,
    priority: row.priority,
    status: row.status,
    evidence: row.evidence,
    dueAt: row.due_at,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
  }));
}

export async function updateSupervisorTask(
  session: AuthSession,
  taskId: string,
  action: "done" | "dismiss" | "snooze",
) {
  assertTasksEnabled();
  const status = action === "done" ? "done" : action === "dismiss" ? "dismissed" : "snoozed";
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `UPDATE supervisor_tasks
        SET status = $4,
            completed_at = CASE WHEN $4 IN ('done', 'dismissed') THEN NOW() ELSE NULL END,
            snoozed_until = CASE WHEN $4 = 'snoozed' THEN NOW() + INTERVAL '1 day' ELSE NULL END,
            updated_at = NOW()
      WHERE id = $1::uuid
        AND empresa_id = $2
        AND assignee_id = $3::uuid
        AND status IN ('open', 'snoozed')
      RETURNING id::text`,
    [taskId, session.companyId, session.userId, status],
    { cache: false },
  );
  if (!result.rows[0]) throw new ApiError(404, "Tarea no encontrada");
  return { id: result.rows[0].id, status };
}

export async function generateSupervisorTasks(session: AuthSession) {
  assertTasksEnabled();
  const candidates = buildSupervisorTaskCandidates(await getSupervisorOperationalSnapshot(session));
  return withCompanyContext(session.companyId, async (client) => {
    const run = await client.query<{ id: string }>(
      `INSERT INTO supervisor_runs (empresa_id, rule_version, status)
       VALUES ($1, 'v1', 'running') RETURNING id::text`,
      [session.companyId],
    );
    let created = 0;
    for (const task of candidates) {
      const inserted = await client.query(
        `INSERT INTO supervisor_tasks (
           empresa_id, assignee_id, kind, entity_type, entity_id, title, detail,
           priority, dedupe_key, evidence, due_at
         ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz)
         ON CONFLICT (empresa_id, assignee_id, dedupe_key)
           WHERE status IN ('open', 'snoozed')
         DO NOTHING`,
        [
          session.companyId,
          session.userId,
          task.kind,
          task.entityType,
          task.entityId,
          task.title,
          task.detail,
          task.priority,
          task.dedupeKey,
          JSON.stringify(task.evidence),
          task.dueAt,
        ],
      );
      created += inserted.rowCount ?? 0;
    }
    await client.query(
      `UPDATE supervisor_runs
          SET status = 'completed', counters = $3::jsonb, finished_at = NOW()
        WHERE id = $1::uuid AND empresa_id = $2`,
      [run.rows[0]!.id, session.companyId, JSON.stringify({ candidates: candidates.length, created })],
    );
    return { candidates: candidates.length, created };
  });
}
