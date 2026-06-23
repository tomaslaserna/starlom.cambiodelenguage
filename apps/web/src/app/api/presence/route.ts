import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

async function touchPresence(request: NextRequest) {
  const session = await requireApiSession();
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? "";

  return withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `
        INSERT INTO app_user_presence (
          empresa_id, id_usuario, usuario, nombre, last_seen, user_agent
        )
        VALUES ($1, $2, $3, $4, NOW(), $5)
        ON CONFLICT (empresa_id, id_usuario) DO UPDATE
        SET usuario = EXCLUDED.usuario,
            nombre = EXCLUDED.nombre,
            last_seen = NOW(),
            user_agent = EXCLUDED.user_agent
      `,
      [session.companyId, session.userId, session.username, session.displayName, userAgent],
    );

    const online = await client.query<{
      id_usuario: number;
      usuario: string;
      nombre: string;
      last_seen: string;
    }>(
      `
        SELECT id_usuario, usuario, nombre, last_seen::text
        FROM app_user_presence
        WHERE empresa_id = $1 AND last_seen >= NOW() - INTERVAL '5 minutes'
        ORDER BY last_seen DESC, usuario ASC
      `,
      [session.companyId],
    );

    return {
      onlineUsers: online.rows.map((row) => ({
        userId: row.id_usuario,
        username: row.usuario,
        displayName: row.nombre,
        lastSeen: row.last_seen,
      })),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const data = await touchPresence(request);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await touchPresence(request);
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
