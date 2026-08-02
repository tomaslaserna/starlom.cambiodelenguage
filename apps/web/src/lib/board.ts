import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { parseMentions } from "@/lib/board-mentions";

const READ = { cache: false } as const;
export const BOARD_COLORS = ["amarillo", "verde", "rosa", "azul", "naranja"] as const;
const COLOR_SET = new Set<string>(BOARD_COLORS);

const COWORKERS_SQL = `
  SELECT u.usuario
  FROM usuarios u
  JOIN usuario_empresa ue ON ue.id_usuario = u.id
  WHERE ue.empresa_id = $1 AND ue.activo = TRUE
    AND COALESCE(u.rango, '') NOT IN ('Minorista', 'Mayorista')
  ORDER BY u.usuario ASC
`;

export type BoardNote = {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  mentions: string[];
};

export async function boardCoworkers(session: AuthSession): Promise<string[]> {
  const result = await queryWithCompanyContext<{ usuario: string }>(session.companyId, COWORKERS_SQL, [session.companyId], READ);
  return result.rows.map((row) => row.usuario).filter((usuario) => usuario && usuario !== session.username);
}

export async function listBoardNotes(session: AuthSession): Promise<BoardNote[]> {
  const [notes, mentions] = await Promise.all([
    queryWithCompanyContext<{ id: string; text: string; color: string; x: string; y: string }>(
      session.companyId,
      `SELECT id::text, text, color, x::text, y::text FROM board_notes WHERE empresa_id = $1 AND owner_username = $2 ORDER BY created_at ASC`,
      [session.companyId, session.username],
      READ,
    ),
    queryWithCompanyContext<{ note_id: string; mentioned_username: string }>(
      session.companyId,
      `SELECT m.note_id::text, m.mentioned_username
       FROM board_note_mentions m
       JOIN board_notes n ON n.id = m.note_id AND n.empresa_id = m.empresa_id
       WHERE m.empresa_id = $1 AND n.owner_username = $2`,
      [session.companyId, session.username],
      READ,
    ),
  ]);

  const byNote = new Map<string, string[]>();
  for (const row of mentions.rows) {
    const list = byNote.get(row.note_id) ?? [];
    list.push(row.mentioned_username);
    byNote.set(row.note_id, list);
  }
  return notes.rows.map((row) => ({
    id: row.id,
    text: row.text,
    color: row.color,
    x: Number(row.x),
    y: Number(row.y),
    mentions: byNote.get(row.id) ?? [],
  }));
}

export async function createBoardNote(session: AuthSession, input: { x?: number; y?: number }): Promise<BoardNote> {
  const x = Number.isFinite(Number(input.x)) ? Number(input.x) : 0;
  const y = Number.isFinite(Number(input.y)) ? Number(input.y) : 0;
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `INSERT INTO board_notes (empresa_id, owner_username, x, y) VALUES ($1, $2, $3, $4) RETURNING id::text`,
    [session.companyId, session.username, x, y],
  );
  return { id: result.rows[0].id, text: "", color: "amarillo", x, y, mentions: [] };
}

export async function updateBoardNote(
  session: AuthSession,
  id: string,
  patch: { text?: string; color?: string; x?: number; y?: number },
) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "Nota inválida");

  await withCompanyContext(session.companyId, async (client) => {
    const existing = await client.query(
      `SELECT id FROM board_notes WHERE id = $1::uuid AND empresa_id = $2 AND owner_username = $3 FOR UPDATE`,
      [id, session.companyId, session.username],
    );
    if (!existing.rows[0]) throw new ApiError(404, "La nota no existe");

    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (patch.text !== undefined) {
      sets.push(`text = $${i++}`);
      params.push(String(patch.text).slice(0, 2000));
    }
    if (patch.color !== undefined) {
      if (!COLOR_SET.has(String(patch.color))) throw new ApiError(400, "Color inválido");
      sets.push(`color = $${i++}`);
      params.push(String(patch.color));
    }
    if (patch.x !== undefined && Number.isFinite(Number(patch.x))) {
      sets.push(`x = $${i++}`);
      params.push(Number(patch.x));
    }
    if (patch.y !== undefined && Number.isFinite(Number(patch.y))) {
      sets.push(`y = $${i++}`);
      params.push(Number(patch.y));
    }
    if (sets.length) {
      sets.push(`updated_at = now()`);
      params.push(id, session.companyId, session.username);
      await client.query(
        `UPDATE board_notes SET ${sets.join(", ")} WHERE id = $${i++}::uuid AND empresa_id = $${i++} AND owner_username = $${i++}`,
        params,
      );
    }

    if (patch.text !== undefined) {
      const coworkersResult = await client.query<{ usuario: string }>(COWORKERS_SQL, [session.companyId]);
      const valid = coworkersResult.rows.map((row) => row.usuario).filter((usuario) => usuario && usuario !== session.username);
      const newMentions = parseMentions(String(patch.text), valid);

      const previous = await client.query<{ mentioned_username: string }>(
        `SELECT mentioned_username FROM board_note_mentions WHERE note_id = $1::uuid AND empresa_id = $2`,
        [id, session.companyId],
      );
      const previousSet = new Set(previous.rows.map((row) => row.mentioned_username));

      await client.query(`DELETE FROM board_note_mentions WHERE note_id = $1::uuid AND empresa_id = $2`, [id, session.companyId]);
      for (const username of newMentions) {
        await client.query(
          `INSERT INTO board_note_mentions (note_id, empresa_id, mentioned_username) VALUES ($1::uuid, $2, $3)`,
          [id, session.companyId, username],
        );
      }

      // Aviso interno solo a los recién mencionados en esta edición.
      for (const username of newMentions.filter((mentioned) => !previousSet.has(mentioned))) {
        await client.query(
          `INSERT INTO mensajes (de, para, asunto, cuerpo, tipo, importancia, estado, empresa_id)
           VALUES ($1, $2, $3, $4, 'directo', 'normal', 'enviado', $5)`,
          [session.username, username, "Te mencionaron en el pizarrón", String(patch.text).slice(0, 500), session.companyId],
        );
      }
    }
  });
}

export async function deleteBoardNote(session: AuthSession, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "Nota inválida");
  await queryWithCompanyContext(
    session.companyId,
    `DELETE FROM board_notes WHERE id = $1::uuid AND empresa_id = $2 AND owner_username = $3`,
    [id, session.companyId, session.username],
  );
}
