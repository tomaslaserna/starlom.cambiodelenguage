import { NextResponse } from "next/server";
import {
  currentSession,
  encodeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  validateSessionIdentity,
} from "@/lib/auth";
import { refreshSession } from "@/lib/session-token";

export const runtime = "nodejs";

export async function POST() {
  const current = await currentSession();
  if (!current) {
    return NextResponse.json({ ok: false, error: "La sesion vencio" }, { status: 401 });
  }

  const validated = await validateSessionIdentity(current);
  if (!validated) {
    const response = NextResponse.json({ ok: false, error: "La sesion ya no es valida" }, { status: 401 });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  }

  const session = refreshSession(validated);
  const response = NextResponse.json({
    ok: true,
    expiresAt: session.expiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt ?? session.expiresAt,
  });
  response.cookies.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions());
  return response;
}
