import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db";
import { getDatabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  try {
    const databaseEnv = getDatabaseEnv();
    const database = await checkDatabaseConnection();

    return NextResponse.json({
      ok: true,
      service: "starlim-web",
      runtime: "nodejs",
      database: {
        ok: database.ok,
        source: databaseEnv.source,
        serverTime: database.serverTime,
        latencyMs: database.latencyMs,
      },
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "starlim-web",
        runtime: "nodejs",
        error: error instanceof Error ? error.message : "Unknown health check error",
        latencyMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
