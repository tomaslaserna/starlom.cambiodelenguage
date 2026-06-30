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

export const runtime = "nodejs";

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
  const contentType = request.headers.get("content-type") ?? "";
  let identifier = "";
  let password = "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    identifier = String(body.identifier ?? body.correo ?? "");
    password = String(body.password ?? body.contrasena ?? "");
  } else {
    const form = await request.formData();
    identifier = String(form.get("identifier") ?? form.get("correo") ?? "");
    password = String(form.get("password") ?? form.get("contrasena") ?? "");
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
