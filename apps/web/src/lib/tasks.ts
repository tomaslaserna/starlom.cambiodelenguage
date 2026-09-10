import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { textField, type RequestBody } from "@/lib/request-body";

const PRIORITIES = new Set(["urgente", "alta", "normal"]);
const RECURRENCE_TYPES = new Set(["unica", "diaria", "semanal", "mensual"]);

function dateTimeOrNull(value: string) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function taskStatus(priority: string, deadline: string | null, completed = false) {
  if (completed) return "completado";
  if (deadline && Date.parse(deadline) < Date.now()) return "vencido";
  return priority;
}

function taskInputFromBody(body: RequestBody) {
  const title = textField(body, "title") || textField(body, "titulo");
  if (!title) throw new ApiError(400, "El titulo es obligatorio");
  const priority = textField(body, "priority") || textField(body, "prioridad") || "normal";
  const recurrenceType = textField(body, "recurrenceType") || textField(body, "recurrencia_tipo") || "unica";
  const recurrenceDayMonth = Number(body.recurrenceDayMonth ?? body.recurrencia_dia_mes ?? 0);
  const recurrenceDayWeek = Number(body.recurrenceDayWeek ?? body.recurrencia_dia_semana ?? 0);
  const recurrenceTime = textField(body, "recurrenceTime") || textField(body, "recurrencia_hora");

  return {
    title,
    description: textField(body, "description") || textField(body, "descripcion"),
    priority: PRIORITIES.has(priority) ? priority : "normal",
    deadline: dateTimeOrNull(textField(body, "deadline") || textField(body, "fecha_limite")),
    sendAt: dateTimeOrNull(textField(body, "sendAt") || textField(body, "fecha_envio")),
    assignedTo: textField(body, "assignedTo") || textField(body, "asignado_a"),
    recurrenceType: RECURRENCE_TYPES.has(recurrenceType) ? recurrenceType : "unica",
    recurrenceDayMonth: Number.isInteger(recurrenceDayMonth) && recurrenceDayMonth >= 1 && recurrenceDayMonth <= 31 ? recurrenceDayMonth : null,
    recurrenceDayWeek: Number.isInteger(recurrenceDayWeek) && recurrenceDayWeek >= 0 && recurrenceDayWeek <= 6 ? recurrenceDayWeek : null,
    recurrenceTime: /^\d{2}:\d{2}$/.test(recurrenceTime) ? recurrenceTime : null,
  };
}

async function assertActiveEmployee(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }, companyId: number, username: string) {
  const result = await client.query(
    `
      SELECT u.id
      FROM usuarios u
      JOIN usuario_empresa ue ON ue.id_usuario = u.id
      WHERE u.usuario = $1 AND ue.empresa_id = $2 AND ue.activo = TRUE
      LIMIT 1
    `,
    [username, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "El destinatario no existe");
}

export async function listTaskAssignees(session: AuthSession): Promise<string[]> {
  const result = await queryWithCompanyContext<{ usuario: string }>(
    session.companyId,
    `
      SELECT u.usuario
      FROM usuarios u
      JOIN usuario_empresa ue ON ue.id_usuario = u.id
      WHERE ue.empresa_id = $1
        AND ue.activo = TRUE
        AND COALESCE(u.rango, '') NOT IN ('Minorista','Mayorista')
      ORDER BY u.usuario ASC
    `,
    [session.companyId],
  );
  return result.rows.map((row) => row.usuario).filter((username) => username && username !== session.username);
}

export async function listTasks(session: AuthSession, search = "", order = "prioridad") {
  const like = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const personalOrder =
    order === "reciente"
      ? "fecha_creacion DESC"
      : `CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 0 ELSE 1 END,
         CASE WHEN prioridad = 'urgente' THEN 0 WHEN prioridad = 'alta' THEN 1 ELSE 2 END,
         fecha_creacion DESC`;

  const personal = await queryWithCompanyContext<{
    id: number;
    titulo: string;
    descripcion: string;
    prioridad: string;
    fecha_creacion: string;
    fecha_limite: string | null;
  }>(
    session.companyId,
    `
      SELECT id, titulo, descripcion, prioridad, fecha_creacion::text, fecha_limite::text
      FROM recordatorios
      WHERE completado = 0
        AND empresa_id = $1
        AND (usuario = '' OR usuario = $2)
        AND (fecha_envio IS NULL OR fecha_envio <= NOW())
        AND ($3 = '' OR titulo ILIKE $4 ESCAPE '\\')
      ORDER BY ${personalOrder}
    `,
    [session.companyId, session.username, search, like],
  );

  const received = await queryWithCompanyContext<{
    id: number;
    titulo: string;
    descripcion: string;
    prioridad: string;
    fecha_creacion: string;
    fecha_limite: string | null;
    asignado_por: string;
  }>(
    session.companyId,
    `
      SELECT id, titulo, descripcion, prioridad, fecha_creacion::text,
             fecha_limite::text, asignado_por
      FROM tareas_asignadas
      WHERE empresa_id = $1
        AND asignado_a = $2
        AND completado = 0
        AND (fecha_envio IS NULL OR fecha_envio <= NOW())
      ORDER BY CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 0 ELSE 1 END,
               CASE WHEN prioridad = 'urgente' THEN 0 WHEN prioridad = 'alta' THEN 1 ELSE 2 END,
               fecha_creacion DESC
    `,
    [session.companyId, session.username],
  );

  const assigned = await queryWithCompanyContext<{
    id: number;
    titulo: string;
    descripcion: string;
    prioridad: string;
    fecha_creacion: string;
    fecha_limite: string | null;
    asignado_a: string;
    completado: number;
    mensaje_completado: string;
    fecha_completado: string | null;
  }>(
    session.companyId,
    `
      SELECT id, titulo, descripcion, prioridad, fecha_creacion::text,
             fecha_limite::text, asignado_a, completado,
             mensaje_completado, fecha_completado::text
      FROM tareas_asignadas
      WHERE empresa_id = $1 AND asignado_por = $2
      ORDER BY completado ASC,
               CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 0 ELSE 1 END,
               CASE WHEN prioridad = 'urgente' THEN 0 WHEN prioridad = 'alta' THEN 1 ELSE 2 END,
               fecha_creacion DESC
    `,
    [session.companyId, session.username],
  );

  return {
    personal: personal.rows.map((row) => ({
      id: row.id,
      title: row.titulo,
      description: row.descripcion,
      priority: row.prioridad,
      createdAt: row.fecha_creacion,
      deadline: row.fecha_limite,
      status: taskStatus(row.prioridad, row.fecha_limite),
    })),
    received: received.rows.map((row) => ({
      id: row.id,
      title: row.titulo,
      description: row.descripcion,
      priority: row.prioridad,
      createdAt: row.fecha_creacion,
      deadline: row.fecha_limite,
      assignedBy: row.asignado_por,
      status: taskStatus(row.prioridad, row.fecha_limite),
    })),
    assigned: assigned.rows.map((row) => ({
      id: row.id,
      title: row.titulo,
      description: row.descripcion,
      priority: row.prioridad,
      createdAt: row.fecha_creacion,
      deadline: row.fecha_limite,
      assignedTo: row.asignado_a,
      completed: Number(row.completado) === 1,
      completionMessage: row.mensaje_completado,
      completedAt: row.fecha_completado,
      status: taskStatus(row.prioridad, row.fecha_limite, Number(row.completado) === 1),
    })),
  };
}

export async function createTask(session: AuthSession, body: RequestBody) {
  const input = taskInputFromBody(body);

  return withCompanyContext(session.companyId, async (client) => {
    if (input.assignedTo) {
      await assertActiveEmployee(client, session.companyId, input.assignedTo);
      const result = await client.query<{ id: number }>(
        `
          INSERT INTO tareas_asignadas (
            titulo, descripcion, prioridad, fecha_limite, fecha_envio,
            asignado_por, asignado_a, recurrencia_tipo, recurrencia_dia_mes,
            recurrencia_dia_semana, recurrencia_hora, recurrencia_activa, empresa_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `,
        [
          input.title,
          input.description,
          input.priority,
          input.deadline,
          input.sendAt,
          session.username,
          input.assignedTo,
          input.recurrenceType,
          input.recurrenceDayMonth,
          input.recurrenceDayWeek,
          input.recurrenceTime,
          input.recurrenceType !== "unica",
          session.companyId,
        ],
      );

      return { id: result.rows[0].id, type: "assigned" };
    }

    const result = await client.query<{ id: number }>(
      `
        INSERT INTO recordatorios (
          titulo, descripcion, prioridad, fecha_limite, fecha_envio, usuario,
          recurrencia_tipo, recurrencia_dia_mes, recurrencia_dia_semana,
          recurrencia_hora, recurrencia_activa, empresa_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `,
      [
        input.title,
        input.description,
        input.priority,
        input.deadline,
        input.sendAt,
        session.username,
        input.recurrenceType,
        input.recurrenceDayMonth,
        input.recurrenceDayWeek,
        input.recurrenceTime,
        input.recurrenceType !== "unica",
        session.companyId,
      ],
    );
    return { id: result.rows[0].id, type: "personal" };
  });
}

export function completionInputFromBody(body: RequestBody) {
  return { message: textField(body, "message") || textField(body, "mensaje") };
}

export async function completeTask(
  session: AuthSession,
  id: number,
  input: ReturnType<typeof completionInputFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const task = await client.query<{ id: number; titulo: string; asignado_por: string }>(
      `
        SELECT id, titulo, asignado_por
        FROM tareas_asignadas
        WHERE id = $1 AND empresa_id = $2 AND asignado_a = $3 AND completado = 0
        LIMIT 1
      `,
      [id, session.companyId, session.username],
    );

    if (task.rows[0]) {
      await client.query(
        `
          UPDATE tareas_asignadas
          SET completado = 1, mensaje_completado = $1, fecha_completado = NOW()
          WHERE id = $2 AND empresa_id = $3
        `,
        [input.message, id, session.companyId],
      );

      return { id, type: "assigned" };
    }

    const reminder = await client.query<{ id: number }>(
      `
        UPDATE recordatorios
        SET completado = 1
        WHERE id = $1
          AND empresa_id = $2
          AND (usuario = '' OR usuario = $3)
          AND completado = 0
        RETURNING id
      `,
      [id, session.companyId, session.username],
    );

    if (!reminder.rows[0]) throw new ApiError(404, "Tarea no encontrada o no autorizada");
    return { id, type: "personal" };
  });
}
