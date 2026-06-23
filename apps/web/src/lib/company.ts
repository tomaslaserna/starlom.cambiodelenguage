import type { NextRequest } from "next/server";

export const DEFAULT_COMPANY_ID = 1;

export function parseCompanyId(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_COMPANY_ID;
  return parsed;
}

export function companyIdFromRequest(request: NextRequest): number {
  return parseCompanyId(request.headers.get("x-starlim-company-id"));
}
