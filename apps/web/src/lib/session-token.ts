import { createHmac, timingSafeEqual } from "node:crypto";
import { envValue } from "@/lib/env";

export const SESSION_COOKIE = "starlim_node_session";
export const SESSION_TTL_SECONDS = 20 * 60;

export type AuthSession = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  companyId: number;
  companyName: string;
  expiresAt: number;
};

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

export function newSessionExpiry() {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}

export function refreshSession(session: AuthSession): AuthSession {
  return { ...session, expiresAt: newSessionExpiry() };
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
    if (!session.expiresAt || session.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
