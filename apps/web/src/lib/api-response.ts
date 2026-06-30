import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok<T extends Record<string, unknown>>(payload: T, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status });
}

export function fail(status: number, error: string, requestId?: string) {
  return NextResponse.json({ ok: false, error, ...(requestId ? { requestId } : {}) }, { status });
}

export function handleApiError(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof ApiError) return fail(error.status, error.message, requestId);

  if (error instanceof Error) {
    console.error("[Starlim API]", {
      requestId,
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  } else {
    console.error("[Starlim API]", { requestId, error });
  }

  return fail(500, "Error interno del servidor", requestId);
}
