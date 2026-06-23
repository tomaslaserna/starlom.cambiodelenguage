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

export function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) return fail(error.status, error.message);
  console.error("[StarLim API]", error);
  return fail(500, "Error interno del servidor");
}

