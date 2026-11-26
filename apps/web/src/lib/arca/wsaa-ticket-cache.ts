import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { ApiError } from "@/lib/api-response";
import { getDbPool } from "@/lib/db";
import { envValue } from "@/lib/env";

export type WsaaTicket = {
  token: string;
  sign: string;
  expiresAt: number;
};

function encryptionKey() {
  const secret = envValue("STARLIM_SESSION_SECRET");
  if (!secret) throw new ApiError(503, "Falta la clave de cifrado del ticket de ARCA.");
  return createHmac("sha256", secret).update("starlim:arca:wsaa:v1").digest();
}

function encryptTicket(ticket: WsaaTicket, cacheKey: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(cacheKey));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(ticket), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptTicket(payload: Buffer, cacheKey: string, key: Buffer): WsaaTicket {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(cacheKey));
    decipher.setAuthTag(payload.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    throw new ApiError(503, "No se pudo leer el ticket de ARCA guardado.");
  }
}

export async function getSharedWsaaTicket(cacheKey: string, issueTicket: () => Promise<WsaaTicket>) {
  const key = encryptionKey();
  const client = await getDbPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '35s'");
    // WSAA rejects a second authentication request while a ticket is still active.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [cacheKey]);
    const { rows } = await client.query<{ encrypted_ticket: Buffer }>(
      "SELECT encrypted_ticket FROM starlim_arca.wsaa_tickets WHERE cache_key = $1 AND expires_at > clock_timestamp()",
      [cacheKey],
    );
    const stored = rows[0];
    const ticket = stored ? decryptTicket(stored.encrypted_ticket, cacheKey, key) : await issueTicket();
    if (!stored) {
      await client.query(
        "INSERT INTO starlim_arca.wsaa_tickets (cache_key, encrypted_ticket, expires_at) VALUES ($1, $2, $3) " +
        "ON CONFLICT (cache_key) DO UPDATE SET encrypted_ticket = excluded.encrypted_ticket, expires_at = excluded.expires_at",
        [cacheKey, encryptTicket(ticket, cacheKey, key), new Date(ticket.expiresAt)],
      );
    }
    await client.query("COMMIT");
    return ticket;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
