import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  isAdminRole,
  validateSessionIdentity,
  type AuthSession,
} from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { getDbPool } from "@/lib/db";
import { envValue } from "@/lib/env";
import {
  DOT_SCOPE,
  hash,
  nonce,
  pkce,
  validRedirect,
  equal,
} from "./dot-protocol.mjs";

export function dotOrigin() {
  return (
    envValue("STARLIM_DOT_ORIGIN") || "https://starlim.vercel.app"
  ).replace(/\/$/, "");
}
export function dotResource() {
  return `${dotOrigin()}/api/supervisor-lab/mcp`;
}
function encryptionKey() {
  const secret = envValue("STARLIM_SESSION_SECRET");
  if (!secret) throw new Error("Missing STARLIM_SESSION_SECRET");
  return createHash("sha256").update(`starlim-dot-v1:${secret}`).digest();
}
export function encryptDotSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  return Buffer.concat([
    iv,
    cipher.update(value),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function decryptDotSecret(value: string) {
  const data = Buffer.from(value, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    data.subarray(0, 12),
  );
  decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([
    decipher.update(data.subarray(12, -16)),
    decipher.final(),
  ]).toString();
}
export async function registerDotClient(body: Record<string, unknown>) {
  const redirects = body.redirect_uris;
  if (
    !Array.isArray(redirects) ||
    redirects.length < 1 ||
    redirects.length > 5 ||
    !redirects.every(validRedirect) ||
    (body.token_endpoint_auth_method &&
      body.token_endpoint_auth_method !== "none")
  )
    throw new ApiError(400, "Cliente OAuth inválido");
  const clientId = `dot_${nonce()}`;
  await getDbPool().query(
    "INSERT INTO starlim_dot.oauth_clients(id,redirect_uris) VALUES($1,$2::jsonb)",
    [clientId, JSON.stringify(redirects)],
  );
  return {
    client_id: clientId,
    redirect_uris: redirects,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}
export async function validateAuthorization(params: URLSearchParams) {
  const clientId = params.get("client_id"),
    redirectUri = params.get("redirect_uri"),
    challenge = params.get("code_challenge");
  const client = await getDbPool().query<{ redirect_uris: string[] }>(
    "SELECT redirect_uris FROM starlim_dot.oauth_clients WHERE id=$1",
    [clientId],
  );
  if (
    !client.rows[0]?.redirect_uris.includes(redirectUri ?? "") ||
    !validRedirect(redirectUri) ||
    params.get("response_type") !== "code" ||
    params.get("code_challenge_method") !== "S256" ||
    !challenge ||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
    params.get("resource") !== dotResource() ||
    (params.get("scope") && params.get("scope") !== DOT_SCOPE)
  )
    throw new ApiError(400, "Solicitud OAuth inválida");
  return { clientId, redirectUri, challenge };
}
export async function authorizeDot(
  session: AuthSession,
  params: URLSearchParams,
) {
  if (!isAdminRole(session.role))
    throw new ApiError(
      403,
      "La conexión del Dot requiere un administrador de StarLim",
    );
  const fields = await validateAuthorization(params);
  const code = nonce();
  await getDbPool().query(
    `INSERT INTO starlim_dot.oauth_grants(client_id,code_hash,challenge,redirect_uri,principal,code_expires_at) VALUES($1,$2,$3,$4,$5::jsonb,now()+interval '5 minutes')`,
    [
      fields.clientId,
      hash(code),
      fields.challenge,
      fields.redirectUri,
      JSON.stringify(session),
    ],
  );
  const callback = new URL(fields.redirectUri!);
  callback.searchParams.set("code", code);
  callback.searchParams.set("iss", dotOrigin());
  if (params.has("state"))
    callback.searchParams.set("state", params.get("state")!);
  return callback;
}
export async function exchangeDotToken(params: URLSearchParams) {
  if (params.get("resource") !== dotResource())
    throw new ApiError(400, "Recurso OAuth inválido");
  const access = nonce(),
    refresh = nonce(),
    clientId = params.get("client_id");
  const client = await getDbPool().connect();
  try {
    await client.query("BEGIN");
    const refreshing = params.get("grant_type") === "refresh_token";
    if (!refreshing && params.get("grant_type") !== "authorization_code")
      throw new ApiError(400, "grant_type inválido");
    const value = refreshing ? params.get("refresh_token") : params.get("code");
    if (!value) throw new ApiError(400, "invalid_grant");
    const found = await client.query<{
      id: string;
      challenge: string;
      redirect_uri: string;
      principal: AuthSession;
    }>(
      `SELECT id,challenge,redirect_uri,principal FROM starlim_dot.oauth_grants WHERE client_id=$1 AND ${refreshing ? "refresh_hash" : "code_hash"}=$2 AND expires_at>now() ${refreshing ? "" : "AND code_expires_at>now()"} FOR UPDATE`,
      [clientId, hash(value)],
    );
    const grant = found.rows[0];
    const verifier = params.get("code_verifier") ?? "";
    if (
      !grant ||
      (!refreshing &&
        (grant.redirect_uri !== params.get("redirect_uri") ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
          !equal(pkce(verifier), grant.challenge)))
    )
      throw new ApiError(400, "invalid_grant");
    const identity = await validateSessionIdentity(grant.principal);
    if (!identity || !isAdminRole(identity.role))
      throw new ApiError(400, "invalid_grant");
    await client.query(
      "UPDATE starlim_dot.oauth_grants SET code_hash=NULL,access_hash=$2,refresh_hash=$3,access_expires_at=now()+interval '1 hour',principal=$4::jsonb WHERE id=$1",
      [grant.id, hash(access), hash(refresh), JSON.stringify(identity)],
    );
    await client.query("COMMIT");
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: "Bearer",
      expires_in: 3600,
      scope: DOT_SCOPE,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function dotPrincipal(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) throw new ApiError(401, "Conectá el plugin de StarLim");
  const grants = await getDbPool().query<{ principal: AuthSession }>(
    "SELECT principal FROM starlim_dot.oauth_grants WHERE access_hash=$1 AND access_expires_at>now() AND expires_at>now()",
    [hash(token)],
  );
  const stored = grants.rows[0]?.principal;
  const principal = stored ? await validateSessionIdentity(stored) : null;
  if (!principal || !isAdminRole(principal.role))
    throw new ApiError(401, "La conexión del Dot venció o fue revocada");
  return principal;
}
