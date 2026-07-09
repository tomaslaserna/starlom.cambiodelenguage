import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  decodeSession,
  encodeSession,
  refreshSession,
  sessionCookieOptions,
} from "@/lib/session-token";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const API_RATE_WINDOW_MS = 60_000;
const API_RATE_LIMIT = 120;
const MUTATION_RATE_LIMIT = 40;
const MAX_ALLOWED_ORIGINS = 20;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function pruneBuckets(now: number) {
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

function rateLimit(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return null;

  const now = Date.now();
  pruneBuckets(now);

  const methodScope = MUTATING_METHODS.has(request.method) ? "mutating" : "read";
  const key = `${clientIp(request)}:${methodScope}:${request.nextUrl.pathname}`;
  const limit = methodScope === "mutating" ? MUTATION_RATE_LIMIT : API_RATE_LIMIT;
  const bucket = rateBuckets.get(key) ?? { count: 0, resetAt: now + API_RATE_WINDOW_MS };
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (bucket.count <= limit) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return new NextResponse(JSON.stringify({ ok: false, error: "Demasiadas solicitudes." }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfterSeconds),
    },
  });
}

function allowedExtraOrigins() {
  return (process.env.STARLIM_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .slice(0, MAX_ALLOWED_ORIGINS);
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    const fetchSite = request.headers.get("sec-fetch-site");
    return fetchSite === "same-origin" || fetchSite === "none";
  }

  try {
    const originUrl = new URL(origin);
    const requestOrigin = request.nextUrl.origin;
    return originUrl.origin === requestOrigin || allowedExtraOrigins().includes(originUrl.origin);
  } catch {
    return false;
  }
}

function csrfResponse() {
  return new NextResponse(JSON.stringify({ ok: false, error: "Origen no permitido." }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}

export function proxy(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) return limited;

  if (MUTATING_METHODS.has(request.method) && !isSameOrigin(request)) {
    return csrfResponse();
  }

  const response = NextResponse.next();
  response.headers.set("X-Request-Id", crypto.randomUUID());
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return response;

  response.cookies.set(SESSION_COOKIE, encodeSession(refreshSession(session)), sessionCookieOptions());
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|starlim-logo.png).*)",
  ],
};
