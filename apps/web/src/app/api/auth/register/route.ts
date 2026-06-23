import { NextResponse, type NextRequest } from "next/server";
import {
  encodeSession,
  registerPublicUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";

export const runtime = "nodejs";

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json");
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let body: Record<string, unknown>;

    if (contentType.includes("application/json")) {
      body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }

    const session = await registerPublicUser({
      displayName: String(body.displayName ?? body.nombre_completo ?? ""),
      email: String(body.email ?? body.correo ?? ""),
      username: String(body.username ?? body.usuario ?? ""),
      password: String(body.password ?? body.contrasena ?? ""),
    });

    const response = wantsJson(request)
      ? NextResponse.json({ ok: true, user: session }, { status: 201 })
      : NextResponse.redirect(new URL("/?registered=1", request.url), { status: 303 });
    response.cookies.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions());
    return response;
  } catch (error) {
    if (!wantsJson(request)) {
      const code = error instanceof Error ? error.message : "save_failed";
      return NextResponse.redirect(new URL(`/login?mode=register&registro_error=${code}`, request.url), {
        status: 303,
      });
    }
    return handleApiError(error);
  }
}
