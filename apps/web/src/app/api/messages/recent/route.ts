import { handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

// Mensajes internos no leidos del usuario logueado. Lo consume el aviso (toast)
// de la esquina inferior derecha, que hace polling.
export async function GET() {
  try {
    const session = await requireApiSession();
    const result = await queryWithCompanyContext<{
      id: number;
      de: string;
      asunto: string;
      cuerpo: string;
      tipo: string;
    }>(
      session.companyId,
      `
        SELECT id, COALESCE(de, '') AS de, COALESCE(asunto, '') AS asunto,
               COALESCE(cuerpo, '') AS cuerpo, COALESCE(tipo, '') AS tipo
        FROM mensajes
        WHERE empresa_id = $1 AND para = $2 AND leido = 0
        ORDER BY id DESC
        LIMIT 5
      `,
      [session.companyId, session.username],
      { cache: false },
    );

    const messages = result.rows.map((row) => ({
      id: Number(row.id),
      de: row.de,
      asunto: row.asunto,
      preview: row.cuerpo.slice(0, 90),
      tipo: row.tipo,
    }));

    return ok({ messages });
  } catch (error) {
    return handleApiError(error);
  }
}
