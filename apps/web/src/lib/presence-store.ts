import { queryWithCompanyContext } from "@/lib/db";
import type { AuthSession } from "@/lib/auth";
import { buildSnapshot, type PresenceRow, type PresenceSnapshot } from "@/lib/presence";

// Records the current user's heartbeat and returns the live presence snapshot
// for their company. One row per (empresa_id, username); "online" is derived in
// buildSnapshot from last_seen being within the presence window.
export async function touchPresence(session: AuthSession): Promise<PresenceSnapshot> {
  const username = session.username?.trim();
  if (!username) return { count: 0, online: [] };

  await queryWithCompanyContext(
    session.companyId,
    `
      INSERT INTO user_presence (empresa_id, username, display_name, last_seen)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (empresa_id, username)
      DO UPDATE SET display_name = EXCLUDED.display_name, last_seen = now()
    `,
    [session.companyId, username, session.displayName?.trim() || username],
  );

  const result = await queryWithCompanyContext<{
    username: string;
    display_name: string | null;
    last_seen: string;
  }>(
    session.companyId,
    `
      SELECT username, display_name, last_seen
      FROM user_presence
      WHERE empresa_id = $1
    `,
    [session.companyId],
    { cache: false },
  );

  const rows: PresenceRow[] = result.rows.map((row) => ({
    username: row.username,
    displayName: row.display_name,
    lastSeen: row.last_seen,
  }));

  return buildSnapshot(rows, username, new Date());
}
