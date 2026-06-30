import { NextResponse } from "next/server";
import { currentSession, publicSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ ok: false, user: null }, { status: 401 });
  return NextResponse.json({ ok: true, user: publicSessionUser(session) });
}
