import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  decodeSession,
  encodeSession,
  refreshSession,
  sessionCookieOptions,
} from "@/lib/session-token";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return response;

  response.cookies.set(SESSION_COOKIE, encodeSession(refreshSession(session)), sessionCookieOptions());
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|starlim-logo.png|api/auth/logout).*)",
  ],
};
