import { NextResponse, type NextRequest } from "next/server";

export function requireApiAccess(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  const configuredKey = process.env.STARLIM_API_KEY;
  if (!configuredKey) {
    return NextResponse.json(
      { ok: false, error: "External API access is not configured." },
      { status: 503 },
    );
  }

  const headerKey = request.headers.get("x-api-key");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (headerKey === configuredKey || bearer === configuredKey) return null;

  return NextResponse.json(
    { ok: false, error: "Missing or invalid API key." },
    { status: 401 },
  );
}
