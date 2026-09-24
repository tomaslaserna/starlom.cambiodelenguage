import { createHmac, timingSafeEqual } from "node:crypto";
import { envValue } from "@/lib/env";
import { STARLIM_CHALLENGE_RADIUS_KM, STARLIM_CHALLENGE_SECONDS, starlimChallengeDistanceKm } from "@/lib/starlim-challenge";

export type ChallengeClaims = {
  startedAt: number;
  expiresAt: number;
  latitude: number;
  longitude: number;
  name: string;
  phone: string;
  businessName: string;
};

function secret() {
  const value = envValue("STARLIM_SESSION_SECRET");
  if (value) return value;
  if (process.env.NODE_ENV === "development") return "starlim-dev-session-secret";
  throw new Error("Missing STARLIM_SESSION_SECRET");
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(`challenge:${payload}`).digest("base64url");
}

export function issueChallengeToken(input: Omit<ChallengeClaims, "startedAt" | "expiresAt">) {
  if (starlimChallengeDistanceKm(input.latitude, input.longitude) > STARLIM_CHALLENGE_RADIUS_KM) return null;
  const startedAt = Date.now();
  const claims: ChallengeClaims = { ...input, startedAt, expiresAt: startedAt + STARLIM_CHALLENGE_SECONDS * 1000 };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, claims };
}

export function verifyChallengeToken(token: string): ChallengeClaims | null {
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ChallengeClaims;
    if (!Number.isFinite(claims.startedAt) || !Number.isFinite(claims.expiresAt) || claims.expiresAt < Date.now()) return null;
    if (claims.startedAt > Date.now() + 60_000 || claims.expiresAt - claims.startedAt !== STARLIM_CHALLENGE_SECONDS * 1000) return null;
    if (!Number.isFinite(claims.latitude) || !Number.isFinite(claims.longitude)) return null;
    if (starlimChallengeDistanceKm(claims.latitude, claims.longitude) > STARLIM_CHALLENGE_RADIUS_KM) return null;
    if (!claims.name || !claims.phone || claims.name.length > 160 || claims.phone.length > 40 || claims.businessName.length > 160) return null;
    return claims;
  } catch { return null; }
}
