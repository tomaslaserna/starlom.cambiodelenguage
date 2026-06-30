const WINDOW_MS = 5 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type LoginAttempt = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number;
};

const attempts = new Map<string, LoginAttempt>();

function nowMs() {
  return Date.now();
}

function prune(now: number) {
  for (const [key, entry] of attempts) {
    if (entry.blockedUntil > now) continue;
    if (now - entry.firstAttemptAt <= WINDOW_MS) continue;
    attempts.delete(key);
  }
}

export function loginRateLimitKey(ip: string, identifier: string) {
  return `${ip.trim() || "unknown"}:${identifier.trim().toLowerCase() || "empty"}`;
}

export function loginRateLimitStatus(key: string) {
  const now = nowMs();
  prune(now);
  const entry = attempts.get(key);
  if (!entry || entry.blockedUntil <= now) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)),
  };
}

export function recordFailedLogin(key: string) {
  const now = nowMs();
  prune(now);
  const current = attempts.get(key);
  const entry =
    current && now - current.firstAttemptAt <= WINDOW_MS
      ? current
      : { count: 0, firstAttemptAt: now, blockedUntil: 0 };

  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_MS;
  }
  attempts.set(key, entry);
}

export function clearLoginRateLimit(key: string) {
  attempts.delete(key);
}
