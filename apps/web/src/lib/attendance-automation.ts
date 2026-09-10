import { withCompanyContext } from "@/lib/db";
import { envValue } from "@/lib/env";

const COMPANY_ID = 1;
const EMPLOYEE = "Francisco Valdes";
const MANAGER = "Augusto Finocchietti";

export async function sendAttendanceStartReminder() {
  const apiKey = envValue("RESEND_API_KEY");
  const from = envValue("STARLIM_EMAIL_FROM");
  if (!apiKey || !from) throw new Error("Faltan RESEND_API_KEY o STARLIM_EMAIL_FROM");

  const employee = await withCompanyContext(COMPANY_ID, async (client) => {
    const result = await client.query<{ email: string | null; full_name: string | null }>(
      `SELECT p.email, p.full_name
       FROM usuarios u
       JOIN usuario_empresa ue ON ue.id_usuario = u.id
       JOIN profiles p ON p.id = u.id
       WHERE ue.empresa_id = $1 AND ue.activo = TRUE AND u.usuario = $2
       LIMIT 1`,
      [COMPANY_ID, EMPLOYEE],
    );
    return result.rows[0];
  });
  if (!employee?.email) throw new Error("Francisco no tiene un correo activo configurado");

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `starlim-asistencia-${date}-${employee.email.toLowerCase()}`,
    },
    body: JSON.stringify({
      from,
      to: [employee.email],
      subject: "Es hora de comenzar tu jornada en Starlim",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
        <h2>Hola ${employee.full_name || "Francisco"}</h2>
        <p>Son las 16:00. Ingresá ahora a Starlim para comenzar tu jornada.</p>
        <p style="margin:24px 0"><a href="https://starlim.vercel.app/login" style="background:#2563eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Conectarme a Starlim</a></p>
        <p style="color:#64748b;font-size:13px">Este recordatorio se envía automáticamente todos los días.</p>
      </div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo enviar el correo (${response.status}): ${detail.slice(0, 300)}`);
  }
  return { sent: true, recipient: employee.email };
}

export async function notifyManagerIfEmployeeIsAbsent() {
  return withCompanyContext(COMPANY_ID, async (client) => {
    const presence = await client.query<{ connected: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM user_presence
         WHERE empresa_id = $1 AND username = $2
           AND last_seen >= date_trunc('day', NOW()) + interval '16 hours'
           AND last_seen <= NOW()
       ) AS connected`,
      [COMPANY_ID, EMPLOYEE],
    );
    if (presence.rows[0]?.connected) return { connected: true, notified: false };

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO recordatorios
         (titulo, descripcion, prioridad, fecha_limite, fecha_envio, usuario,
          completado, recurrencia_tipo, recurrencia_activa, empresa_id)
       SELECT 'Francisco no inició su jornada',
         'A las 16:30 no se registró conexión de Francisco Valdes desde el inicio de su jornada de las 16:00.',
         'urgente', NOW(), NOW(), $2, 0, 'unica', FALSE, $1
       WHERE NOT EXISTS (
         SELECT 1 FROM recordatorios
         WHERE empresa_id = $1 AND usuario = $2
           AND titulo = 'Francisco no inició su jornada'
           AND fecha_creacion >= date_trunc('day', NOW())
           AND fecha_creacion < date_trunc('day', NOW()) + interval '1 day'
       )
       RETURNING id`,
      [COMPANY_ID, MANAGER],
    );
    return { connected: false, notified: Boolean(inserted.rows[0]), notificationId: inserted.rows[0]?.id ?? null };
  });
}
