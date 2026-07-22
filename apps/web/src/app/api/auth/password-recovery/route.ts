import { NextResponse, type NextRequest } from "next/server";
import { requestPasswordRecoveryEmail } from "@/lib/auth";
import { envValue } from "@/lib/env";
import { readRequestBody, textField } from "@/lib/request-body";

export const runtime = "nodejs";

const PASSWORD_RECOVERY_BODY_LIMIT_BYTES = 8 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function formRedirect(request: NextRequest, query: string) {
  return NextResponse.redirect(new URL(`/forgot-password?${query}`, request.url), { status: 303 });
}

function resetPasswordUrl(request: NextRequest) {
  const configuredUrl = envValue("NEXT_PUBLIC_APP_URL");
  if (configuredUrl) {
    const parsedUrl = new URL(configuredUrl);
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      return new URL("/reset-password", parsedUrl.origin).toString();
    }
  }
  return new URL("/reset-password", request.nextUrl.origin).toString();
}

export async function POST(request: NextRequest) {
  const json = wantsJson(request);

  try {
    const body = await readRequestBody(request, PASSWORD_RECOVERY_BODY_LIMIT_BYTES);
    const email = textField(body, "email").toLowerCase();

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return json
        ? NextResponse.json({ ok: false, error: "Ingresa un correo valido." }, { status: 400 })
        : formRedirect(request, "error=invalid");
    }

    const result = await requestPasswordRecoveryEmail(email, resetPasswordUrl(request));
    if (result === "rate_limited") {
      return json
        ? NextResponse.json({ ok: false, error: "Demasiados intentos. Proba mas tarde." }, { status: 429 })
        : formRedirect(request, "error=rate_limited");
    }
    if (result === "unavailable") {
      return json
        ? NextResponse.json({ ok: false, error: "No pudimos procesar la solicitud." }, { status: 503 })
        : formRedirect(request, "error=unavailable");
    }

    const message = "Si el correo esta registrado, recibiras un enlace para cambiar la contrasena.";
    return json
      ? NextResponse.json({ ok: true, message })
      : formRedirect(request, "status=sent");
  } catch (error) {
    console.error("[Starlim Auth] Invalid password recovery request", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return json
      ? NextResponse.json({ ok: false, error: "No pudimos procesar la solicitud." }, { status: 400 })
      : formRedirect(request, "error=invalid");
  }
}
