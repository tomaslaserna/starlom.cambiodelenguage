import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json");
}

export async function POST(request: NextRequest) {
  if (wantsJson(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "El registro publico esta deshabilitado. Un administrador debe crear el usuario.",
      },
      { status: 403 },
    );
  }

  return NextResponse.redirect(new URL("/login?error=register_disabled", request.url), {
    status: 303,
  });
}
