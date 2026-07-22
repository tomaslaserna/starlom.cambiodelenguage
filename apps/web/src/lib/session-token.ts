import { createHmac, timingSafeEqual } from "node:crypto";
import { envValue } from "@/lib/env";

export const SESSION_COOKIE = "starlim_node_session";
export const SESSION_IDLE_TTL_SECONDS = 2 * 60 * 60;
export const SESSION_ABSOLUTE_TTL_SECONDS = 12 * 60 * 60;
export const SESSION_REVALIDATE_SECONDS = 5 * 60;
// Compatibilidad para consumidores existentes: ahora representa el tiempo de inactividad.
export const SESSION_TTL_SECONDS = SESSION_IDLE_TTL_SECONDS;

export type AuthSession = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  companyId: number;
  companyName: string;
  issuedAt?: number;
  absoluteExpiresAt?: number;
  validatedAt?: number;
  expiresAt: number;
};

const SAFE_ROLE_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sessionSecret() {
  const configured = envValue("STARLIM_SESSION_SECRET");
  if (configured) return configured;
  if (process.env.NODE_ENV === "development") return "starlim-dev-session-secret";
  throw new Error("Missing STARLIM_SESSION_SECRET");
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

export function newSessionTiming(now = unixNow()) {
  return {
    issuedAt: now,
    absoluteExpiresAt: now + SESSION_ABSOLUTE_TTL_SECONDS,
    validatedAt: now,
    expiresAt: now + SESSION_IDLE_TTL_SECONDS,
  };
}

export function newSessionExpiry(absoluteExpiresAt?: number, now = unixNow()) {
  return Math.min(now + SESSION_IDLE_TTL_SECONDS, absoluteExpiresAt ?? Number.POSITIVE_INFINITY);
}

export function refreshSession(session: AuthSession): AuthSession {
  const now = unixNow();
  const issuedAt = session.issuedAt ?? now;
  const absoluteExpiresAt = session.absoluteExpiresAt ?? now + SESSION_ABSOLUTE_TTL_SECONDS;
  return {
    ...session,
    issuedAt,
    absoluteExpiresAt,
    expiresAt: newSessionExpiry(absoluteExpiresAt, now),
  };
}

export function encodeSession(session: AuthSession) {
  const payload = base64Url(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): AuthSession | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthSession;
    const now = unixNow();
    if (!session.expiresAt || session.expiresAt <= now) return null;
    if (session.absoluteExpiresAt && session.absoluteExpiresAt <= now) return null;
    if (!isValidSessionShape(session)) return null;
    return session;
  } catch {
    return null;
  }
}

function isValidSessionShape(session: AuthSession) {
  return (
    UUID_PATTERN.test(String(session.userId ?? "")) &&
    typeof session.username === "string" &&
    session.username.length > 0 &&
    session.username.length <= 160 &&
    typeof session.email === "string" &&
    session.email.length > 0 &&
    session.email.length <= 320 &&
    typeof session.displayName === "string" &&
    session.displayName.length > 0 &&
    session.displayName.length <= 160 &&
    typeof session.role === "string" &&
    SAFE_ROLE_PATTERN.test(session.role) &&
    Number.isInteger(session.companyId) &&
    session.companyId > 0 &&
    typeof session.companyName === "string" &&
    session.companyName.length > 0 &&
    session.companyName.length <= 160 &&
    (session.issuedAt === undefined || Number.isInteger(session.issuedAt)) &&
    (session.absoluteExpiresAt === undefined || Number.isInteger(session.absoluteExpiresAt)) &&
    (session.validatedAt === undefined || Number.isInteger(session.validatedAt)) &&
    Number.isInteger(session.expiresAt)
  );
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_IDLE_TTL_SECONDS,
    priority: "high" as const,
  };
}
