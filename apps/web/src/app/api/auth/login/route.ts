import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateUser,
  encodeSession,
  publicSessionUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import {
  clearLoginRateLimit,
  loginRateLimitKey,
  loginRateLimitStatus,
  recordFailedLogin,
} from "@/lib/login-rate-limit";
import { assertRequestSize } from "@/lib/request-body";

export const runtime = "nodejs";
const LOGIN_BODY_LIMIT_BYTES = 16 * 1024;

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json");
}

function requestIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimitedResponse(request: NextRequest, retryAfterSeconds: number) {
  if (wantsJson(request)) {
    return NextResponse.json(
      { ok: false, error: "Demasiados intentos. Proba nuevamente mas tarde." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const response = NextResponse.redirect(new URL("/login?error=rate_limited", request.url), { status: 303 });
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

export async function POST(request: NextRequest) {
  assertRequestSize(request, LOGIN_BODY_LIMIT_BYTES, "El login");
  const contentType = request.headers.get("content-type") ?? "";
  let identifier = "";
  let password = "";

  if (contentType.includes("application/json")) {
    const raw = await request.text().catch(() => "");
    if (Buffer.byteLength(raw, "utf8") > LOGIN_BODY_LIMIT_BYTES) {
      return NextResponse.json({ ok: false, error: "Solicitud demasiado grande." }, { status: 413 });
    }
    const body = safeJson(raw);
    identifier = String(body.identifier ?? body.correo ?? "");
    password = String(body.password ?? body.contrasena ?? "");
  } else if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    identifier = String(form.get("identifier") ?? form.get("correo") ?? "");
    password = String(form.get("password") ?? form.get("contrasena") ?? "");
  } else {
    return wantsJson(request)
      ? NextResponse.json({ ok: false, error: "Content-Type no soportado." }, { status: 415 })
      : NextResponse.redirect(new URL("/login?error=invalid", request.url), { status: 303 });
  }

  const rateLimitKey = loginRateLimitKey(requestIp(request), identifier);
  const rateLimit = loginRateLimitStatus(rateLimitKey);
  if (!rateLimit.allowed) return rateLimitedResponse(request, rateLimit.retryAfterSeconds);

  const session = await authenticateUser(identifier, password);
  if (!session) {
    recordFailedLogin(rateLimitKey);
    if (wantsJson(request)) {
      return NextResponse.json({ ok: false, error: "Credenciales invalidas." }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login?error=invalid", request.url), { status: 303 });
  }

  clearLoginRateLimit(rateLimitKey);
  const response = wantsJson(request)
    ? NextResponse.json({ ok: true, user: publicSessionUser(session) })
    : NextResponse.redirect(new URL("/", request.url), { status: 303 });

  response.cookies.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions());
  return response;
}

function safeJson(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
