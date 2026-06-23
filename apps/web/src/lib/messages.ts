import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { textField, type RequestBody } from "@/lib/request-body";

const PRIORITIES = new Set(["urgente", "alta", "normal"]);
const MESSAGE_IMPORTANCE = new Set(["baja", "normal", "alta", "urgente"]);
const MESSAGE_STATES = new Set(["borrador", "enviado"]);
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

function formatPreview(value: string) {
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
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

export async function listMessageCenter(session: AuthSession) {
  const inbox = await queryWithCompanyContext<{
    id: number;
    de: string;
    para: string;
    asunto: string;
    cuerpo: string;
    fecha: string;
    leido: number;
    tipo: string;
    importancia: string;
  }>(
    session.companyId,
    `
      SELECT id, de, para, asunto, cuerpo, fecha::text, leido, tipo,
             COALESCE(importancia, 'normal') AS importancia
      FROM mensajes
      WHERE empresa_id = $1
        AND para = $2
        AND COALESCE(estado, 'enviado') = 'enviado'
      ORDER BY fecha DESC
      LIMIT 100
    `,
    [session.companyId, session.username],
  );

  const sent = await queryWithCompanyContext<{
    id: number;
    de: string;
    para: string;
    asunto: string;
    cuerpo: string;
    fecha: string;
    leido: number;
    tipo: string;
    importancia: string;
  }>(
    session.companyId,
    `
      SELECT id, de, para, asunto, cuerpo, fecha::text, leido, tipo,
             COALESCE(importancia, 'normal') AS importancia
      FROM mensajes
      WHERE empresa_id = $1
        AND de = $2
        AND COALESCE(estado, 'enviado') = 'enviado'
      ORDER BY fecha DESC
      LIMIT 100
    `,
    [session.companyId, session.username],
  );

  const drafts = await queryWithCompanyContext<{
    id: number;
    de: string;
    para: string;
    asunto: string;
    cuerpo: string;
    fecha: string;
    leido: number;
    tipo: string;
    importancia: string;
  }>(
    session.companyId,
    `
      SELECT id, de, para, asunto, cuerpo, fecha::text, leido, tipo,
             COALESCE(importancia, 'normal') AS importancia
      FROM mensajes
      WHERE empresa_id = $1
        AND de = $2
        AND COALESCE(estado, 'enviado') = 'borrador'
      ORDER BY fecha DESC
      LIMIT 100
    `,
    [session.companyId, session.username],
  );

  const employees = await queryWithCompanyContext<{ usuario: string }>(
    session.companyId,
    `
      SELECT u.usuario
      FROM usuarios u
      JOIN usuario_empresa ue ON ue.id_usuario = u.id
      WHERE ue.empresa_id = $1
        AND ue.activo = TRUE
        AND COALESCE(ue.rango, u.rango) NOT IN ('Minorista','Mayorista')
      ORDER BY u.usuario ASC
    `,
    [session.companyId],
  );

  const mapMessage = (row: (typeof inbox.rows)[number]) => ({
      id: row.id,
      from: row.de,
      to: row.para,
      subject: row.asunto,
      bodyPreview: formatPreview(row.cuerpo),
      body: row.cuerpo,
      date: row.fecha,
      read: Number(row.leido) === 1,
      type: row.tipo,
      importance: row.importancia,
    });

  const inboxRows = inbox.rows.map(mapMessage);
  return {
    messages: inboxRows,
    inbox: inboxRows,
    sent: sent.rows.map(mapMessage),
    drafts: drafts.rows.map(mapMessage),
    employees: employees.rows
      .map((row) => row.usuario)
      .filter((username) => username && username !== session.username),
    meta: {
      unread: inboxRows.filter((message) => !message.read).length,
      sent: sent.rowCount,
      drafts: drafts.rowCount,
    },
  };
}

export function messageInputFromBody(body: RequestBody) {
  const to = textField(body, "to") || textField(body, "para");
  const subject = textField(body, "subject") || textField(body, "asunto");
  const bodyText = textField(body, "body") || textField(body, "cuerpo");
  const importance = textField(body, "importance") || textField(body, "importancia") || "normal";
  const state = textField(body, "state") || textField(body, "estado") || "enviado";
  if (!to || !subject || !bodyText) throw new ApiError(400, "Todos los campos son obligatorios");
  if (subject.length > 255) throw new ApiError(400, "El asunto no puede superar 255 caracteres");
  return {
    to,
    subject,
    body: bodyText,
    importance: MESSAGE_IMPORTANCE.has(importance) ? importance : "normal",
    state: MESSAGE_STATES.has(state) ? state : "enviado",
  };
}

export async function sendMessage(session: AuthSession, input: ReturnType<typeof messageInputFromBody>) {
  return withCompanyContext(session.companyId, async (client) => {
    await assertActiveEmployee(client, session.companyId, input.to);
    const result = await client.query<{ id: number }>(
      `
        INSERT INTO mensajes (de, para, asunto, cuerpo, tipo, importancia, estado, empresa_id)
        VALUES ($1, $2, $3, $4, 'directo', $5, 'enviado', $6)
        RETURNING id
      `,
      [session.username, input.to, input.subject, input.body, input.importance, session.companyId],
    );
    return { id: result.rows[0].id };
  });
}

export function draftMessageInputFromBody(body: RequestBody) {
  const importance = textField(body, "importance") || textField(body, "importancia") || "normal";
  return {
    to: textField(body, "to") || textField(body, "para"),
    subject: textField(body, "subject") || textField(body, "asunto") || "(sin asunto)",
    body: textField(body, "body") || textField(body, "cuerpo"),
    importance: MESSAGE_IMPORTANCE.has(importance) ? importance : "normal",
  };
}

export async function saveMessageDraft(session: AuthSession, input: ReturnType<typeof draftMessageInputFromBody>) {
  const result = await queryWithCompanyContext<{ id: number }>(
    session.companyId,
    `
      INSERT INTO mensajes (de, para, asunto, cuerpo, tipo, importancia, estado, empresa_id)
      VALUES ($1, $2, $3, $4, 'directo', $5, 'borrador', $6)
      RETURNING id
    `,
    [session.username, input.to, input.subject, input.body, input.importance, session.companyId],
  );
  return { id: result.rows[0].id };
}

export async function markMessagesRead(session: AuthSession) {
  const result = await queryWithCompanyContext(
    session.companyId,
    "UPDATE mensajes SET leido = 1 WHERE empresa_id = $1 AND para = $2 AND leido = 0",
    [session.companyId, session.username],
  );
  return { updated: result.rowCount };
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

      const bodyText = `El usuario ${session.username} te asigno una nueva tarea: "${input.title}"${
        input.description ? `\n\nDescripcion: ${input.description}` : ""
      }`;
      await client.query(
        "INSERT INTO mensajes (de, para, asunto, cuerpo, tipo, empresa_id) VALUES ($1, $2, $3, $4, 'tarea_asignada', $5)",
        [session.username, input.assignedTo, `Nueva tarea asignada: ${input.title}`, bodyText, session.companyId],
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

      const bodyText = input.message
        ? `Tarea completada por el usuario ${session.username}.\n\nEl usuario dejo un mensaje: ${input.message}`
        : `Tarea completada por el usuario ${session.username}.`;
      await client.query(
        "INSERT INTO mensajes (de, para, asunto, cuerpo, tipo, empresa_id) VALUES ('Sistema', $1, $2, $3, 'tarea_completada', $4)",
        [task.rows[0].asignado_por, `Tarea completada: ${task.rows[0].titulo}`, bodyText, session.companyId],
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

function dayStart(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function customerMetrics(timestamps: number[]) {
  const gaps: number[] = [];
  for (let index = 1; index < timestamps.length; index++) {
    gaps.push(Math.round((timestamps[index] - timestamps[index - 1]) / 86_400_000));
  }
  if (!gaps.length) return { average: 1, deviation: 0, intervals: 0 };

  const med = Math.max(1, median(gaps));
  const processed = gaps.map((gap) =>
    gaps.length >= 3 ? Math.max(med * 0.3, Math.min(med * 3, gap)) : gap,
  );
  let numerator = 0;
  let denominator = 0;
  for (const [index, gap] of processed.entries()) {
    const weight = index + 1;
    numerator += weight * gap;
    denominator += weight;
  }
  const average = Math.max(1, Math.round(numerator / denominator));
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  return { average, deviation: Math.round(Math.sqrt(variance)), intervals: gaps.length };
}

export async function getCustomerFollowUp(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: number;
    nombre_cliente: string;
    telefono: string;
    vendedor: string;
    fecha: string | null;
  }>(
    companyId,
    `
      SELECT c.id, c.nombre_cliente, COALESCE(c.telefono,'') AS telefono,
             COALESCE(c.vendedor_cl,'') AS vendedor, d.fecha::text
      FROM clientes c
      LEFT JOIN (
        SELECT DISTINCT empresa_id,
               REGEXP_REPLACE(COALESCE(dni_cliente,''), '[^0-9]', '', 'g') AS dni_norm,
               fecha
        FROM ventas
        WHERE empresa_id = $1
          AND COALESCE(estado_pedido,'entregado') = 'entregado'
          AND REGEXP_REPLACE(COALESCE(dni_cliente,''), '[^0-9]', '', 'g') <> ''
      ) d ON d.empresa_id = c.empresa_id
         AND d.dni_norm = REGEXP_REPLACE(COALESCE(c.nro_id,''), '[^0-9]', '', 'g')
         AND d.dni_norm <> ''
      WHERE c.empresa_id = $1
      ORDER BY c.nombre_cliente ASC, c.id ASC, d.fecha ASC
    `,
    [companyId],
  );

  const customers = new Map<
    number,
    { name: string; phone: string; seller: string; timestamps: number[] }
  >();
  for (const row of result.rows) {
    const current =
      customers.get(row.id) ?? {
        name: row.nombre_cliente,
        phone: row.telefono,
        seller: row.vendedor,
        timestamps: [],
      };
    if (row.fecha) current.timestamps.push(dayStart(new Date(row.fecha)));
    customers.set(row.id, current);
  }

  const today = dayStart(new Date());
  const groups: Record<string, unknown[]> = {
    al_dia: [],
    contactar: [],
    riesgo: [],
    perdido: [],
    sin_historial: [],
  };
  const sellers = new Set<string>();

  for (const customer of customers.values()) {
    const timestamps = [...new Set(customer.timestamps)].sort((a, b) => a - b);
    const purchases = timestamps.length;
    if (customer.seller) sellers.add(customer.seller);
    const base = {
      customerName: customer.name,
      phone: customer.phone,
      seller: customer.seller,
      purchases,
      intervals: Math.max(0, purchases - 1),
      lastPurchase: purchases ? new Date(timestamps[purchases - 1]).toISOString().slice(0, 10) : null,
    };

    if (purchases < 2) {
      groups.sin_historial.push({
        ...base,
        reason: purchases === 0 ? "Sin compras entregadas" : "Falta una compra mas",
      });
      continue;
    }

    const metrics = customerMetrics(timestamps);
    const last = timestamps[purchases - 1];
    const daysSince = Math.floor((today - last) / 86_400_000);
    const ratio = metrics.average > 0 ? daysSince / metrics.average : 0;
    const expectedNext = new Date(last + metrics.average * 86_400_000).toISOString().slice(0, 10);
    const row = {
      ...base,
      averageDays: metrics.average,
      deviationDays: metrics.deviation,
      intervals: metrics.intervals,
      daysSinceLastPurchase: daysSince,
      delayDays: Math.round(daysSince - metrics.average),
      expectedNextPurchase: expectedNext,
      ratio,
    };

    if (ratio < 0.85) groups.al_dia.push(row);
    else if (ratio <= 1.25) groups.contactar.push(row);
    else if (ratio <= 2) groups.riesgo.push(row);
    else groups.perdido.push(row);
  }

  for (const key of ["contactar", "riesgo", "perdido"]) {
    groups[key].sort((a, b) => {
      const left = a as { ratio?: number; delayDays?: number };
      const right = b as { ratio?: number; delayDays?: number };
      return (right.delayDays ?? right.ratio ?? 0) - (left.delayDays ?? left.ratio ?? 0);
    });
  }

  return {
    groups,
    sellers: [...sellers].sort((a, b) => a.localeCompare(b)),
    counts: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])),
  };
}
