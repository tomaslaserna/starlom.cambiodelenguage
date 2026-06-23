import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateUser,
  encodeSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

export const runtime = "nodejs";

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json");
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

  const session = await authenticateUser(identifier, password);
  if (!session) {
    if (wantsJson(request)) {
      return NextResponse.json({ ok: false, error: "Credenciales invalidas." }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/login?error=invalid", request.url), { status: 303 });
  }

  const response = wantsJson(request)
    ? NextResponse.json({ ok: true, user: session })
    : NextResponse.redirect(new URL("/customers", request.url), { status: 303 });

  response.cookies.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions());
  return response;
}
