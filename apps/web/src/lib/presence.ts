// Logica pura de presencia: sin acceso a base ni imports de "@/", para que
// pueda testearse con `node --test`. El acceso a la base vive en
// `lib/presence-store.ts` y la API en `app/api/presence/route.ts`.

// Un usuario se considera online si latio dentro de esta ventana. Con un latido
// cada 30 s, 75 s tolera un latido perdido sin marcarlo offline (evita
// parpadeos).
export const PRESENCE_WINDOW_MS = 75_000;

export type PresenceRow = {
  username: string;
  displayName: string | null;
  lastSeen: string | Date;
};

export type OnlineUser = {
  username: string;
  displayName: string;
  isSelf: boolean;
};

export type PresenceSnapshot = {
  count: number;
  online: OnlineUser[];
};

export function isOnline(
  lastSeen: Date | string,
  now: Date,
  windowMs: number = PRESENCE_WINDOW_MS,
): boolean {
  const seen = lastSeen instanceof Date ? lastSeen : new Date(lastSeen);
  const seenMs = seen.getTime();
  if (Number.isNaN(seenMs)) return false;
  // Un timestamp futuro (por diferencias de reloj) se trata como recien visto.
  return now.getTime() - seenMs <= windowMs;
}

export function buildSnapshot(
  rows: PresenceRow[],
  currentUsername: string,
  now: Date,
  windowMs: number = PRESENCE_WINDOW_MS,
): PresenceSnapshot {
  const online = rows
    .filter((row) => isOnline(row.lastSeen, now, windowMs))
    .map((row) => ({
      username: row.username,
      displayName: (row.displayName ?? "").trim() || row.username,
      isSelf: row.username === currentUsername,
    }))
    .sort((left, right) => {
      if (left.isSelf !== right.isSelf) return left.isSelf ? -1 : 1;
      return left.displayName.localeCompare(right.displayName, "es");
    });

  return { count: online.length, online };
}
