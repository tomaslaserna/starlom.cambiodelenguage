import "server-only";
import type { AuthSession } from "@/lib/auth";
import { isAdminRole, validateSessionIdentity } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import type { StarlimSupervisorMessage } from "./agent";
import { compactSupervisorMessages } from "./message-compact";
import {
  getSupervisorChatMemory,
  saveSupervisorChatMemory,
} from "./chat-memory";
import { encryptDotSecret, decryptDotSecret } from "./dot-auth";
import {
  DOT_EVENT,
  hash,
  signingKey,
  verifyCallback,
  questionEvent,
  signedHeaders,
  postWebhook,
  retryDelay,
  terminalDelivery,
} from "./dot-protocol.mjs";

export type DotRequest = {
  id: string;
  user_id: string;
  user_message_id: string;
  question: string;
  context: StarlimSupervisorMessage[];
  principal: AuthSession;
  state: "pending" | "answered" | "cancelled";
  answer: string | null;
  created_at: string;
  attempts: number;
  delivered_at: string | null;
};
type Subscription = {
  id: string;
  user_id: string;
  callback_url: string;
  secret_cipher: string;
  previous_secret_cipher: string | null;
  rotated_at: string | null;
};
export async function dotConnected(session: AuthSession) {
  return withCompanyContext(session.companyId, async (client) =>
    Boolean(
      (
        await client.query(
          "SELECT 1 FROM supervisor_dot_subscriptions WHERE empresa_id=$1 AND active AND (expires_at IS NULL OR expires_at>now()) LIMIT 1",
          [session.companyId],
        )
      ).rows[0],
    ),
  );
}
export async function queueDotQuestion(
  session: AuthSession,
  messages: StarlimSupervisorMessage[],
) {
  const last = messages.at(-1);
  const question = last?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (
    last?.role !== "user" ||
    !question ||
    question.length > 2000 ||
    !last.id ||
    last.id.length > 200
  )
    throw new ApiError(400, "Escribí una consulta de hasta 2000 caracteres");
  if (!(await dotConnected(session)))
    throw new ApiError(
      503,
      "El Dot todavía no está conectado a StarLim. La consulta no se envió a ningún servicio pago.",
    );
  // Only server-held history is authoritative; the browser cannot forge assistant messages.
  const context = await getSupervisorChatMemory(session);
  let duplicateMessage = false;
  const queued = await withCompanyContext(session.companyId, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `dot:${session.companyId}:${session.userId}`,
    ]);
    await client.query(
      "UPDATE supervisor_dot_requests SET state='cancelled' WHERE empresa_id=$1 AND user_id=$2 AND state='pending' AND expires_at<=now()",
      [session.companyId, session.userId],
    );
    const duplicate = await client.query<DotRequest>(
      "SELECT * FROM supervisor_dot_requests WHERE empresa_id=$1 AND user_id=$2 AND user_message_id=$3",
      [session.companyId, session.userId, last.id],
    );
    if (duplicate.rows[0]) {
      duplicateMessage = true;
      return duplicate.rows[0];
    }
    const pending = await client.query(
      "SELECT 1 FROM supervisor_dot_requests WHERE empresa_id=$1 AND user_id=$2 AND state='pending'",
      [session.companyId, session.userId],
    );
    if (pending.rows[0])
      throw new ApiError(409, "Tu consulta anterior sigue pendiente");
    return (
      await client.query<DotRequest>(
        `INSERT INTO supervisor_dot_requests(empresa_id,user_id,user_message_id,question,context,principal) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING *`,
        [
          session.companyId,
          session.userId,
          last.id,
          question,
          JSON.stringify(compactSupervisorMessages(context, 12, 4000)),
          JSON.stringify(session),
        ],
      )
    ).rows[0];
  });
  if (!duplicateMessage) await saveSupervisorChatMemory(session, [...context, last]);
  return queued;
}
export async function pendingDotRequest(session: AuthSession) {
  await withCompanyContext(session.companyId, (client) =>
    client.query("DELETE FROM supervisor_dot_requests WHERE empresa_id=$1 AND expires_at<=now()", [session.companyId]),
  );
  return withCompanyContext(
    session.companyId,
    async (client) =>
      (
        await client.query<DotRequest>(
          "SELECT * FROM supervisor_dot_requests WHERE empresa_id=$1 AND user_id=$2 AND state='pending' AND expires_at>now() ORDER BY created_at DESC LIMIT 1",
          [session.companyId, session.userId],
        )
      ).rows[0] ?? null,
  );
}
export async function listDotQuestions(owner: AuthSession) {
  return withCompanyContext(owner.companyId, async (client) =>
    (
      await client.query<DotRequest>(
        "SELECT * FROM supervisor_dot_requests WHERE empresa_id=$1 AND state='pending' AND expires_at>now() ORDER BY created_at LIMIT 20",
        [owner.companyId],
      )
    ).rows.map(({ id, question, created_at }) => ({
      requestId: id,
      question,
      createdAt: created_at,
    })),
  );
}
export async function getDotQuestion(owner: AuthSession, id: string) {
  const row = await withCompanyContext(
    owner.companyId,
    async (client) =>
      (
        await client.query<DotRequest>(
          "SELECT * FROM supervisor_dot_requests WHERE empresa_id=$1 AND id=$2::uuid AND expires_at>now()",
          [owner.companyId, id],
        )
      ).rows[0],
  );
  if (!row || row.state !== "pending")
    throw new ApiError(404, "La consulta ya no está pendiente");
  const principal = await validateSessionIdentity(row.principal);
  if (!principal || principal.companyId !== owner.companyId)
    throw new ApiError(403, "El usuario de la consulta ya no tiene acceso");
  return { ...row, principal };
}
export async function answerDotQuestion(
  owner: AuthSession,
  id: string,
  answer: string,
) {
  if (!answer.trim() || answer.length > 16000)
    throw new ApiError(400, "Respuesta inválida");
  // Lock the same row as cancellation; late/duplicate replies cannot resurrect a cleared chat.
  await withCompanyContext(owner.companyId, async (client) => {
    const found = await client.query<DotRequest>(
      "SELECT * FROM supervisor_dot_requests WHERE empresa_id=$1 AND id=$2::uuid AND expires_at>now() FOR UPDATE",
      [owner.companyId, id],
    );
    const row = found.rows[0];
    if (!row || row.state === "cancelled")
      throw new ApiError(409, "La consulta fue cancelada");
    if (row.state === "answered") {
      if (row.answer !== answer)
        throw new ApiError(409, "La consulta ya tiene respuesta");
      return;
    }
    const identity = await validateSessionIdentity(row.principal);
    if (!identity) throw new ApiError(403, "El usuario ya no tiene acceso");
    const message = {
      id: `dot-${id}`,
      role: "assistant",
      parts: [{ type: "text", text: answer }],
    };
    await client.query(
      `INSERT INTO supervisor_chat_messages(empresa_id,user_id,message_id,role,message,sequence_index,model)
      SELECT $1,$2,$3,'assistant',$4::jsonb,COALESCE(MAX(sequence_index),-1)+1,'chatgpt/dot'
      FROM supervisor_chat_messages WHERE empresa_id=$1 AND user_id=$2
      ON CONFLICT(empresa_id,user_id,message_id) DO NOTHING`,
      [owner.companyId, row.user_id, message.id, JSON.stringify(message)],
    );
    await client.query(
      "UPDATE supervisor_dot_requests SET state='answered',answer=$3,context='[]',principal=principal-'email' WHERE empresa_id=$1 AND id=$2",
      [owner.companyId, id, answer],
    );
  });
  return { delivered: true, requestId: id };
}
export async function cancelDotQuestion(session: AuthSession) {
  await withCompanyContext(session.companyId, (client) =>
    client.query(
      "UPDATE supervisor_dot_requests SET state='cancelled' WHERE empresa_id=$1 AND user_id=$2 AND state='pending'",
      [session.companyId, session.userId],
    ),
  );
}
export async function subscribeDot(
  owner: AuthSession,
  params: Record<string, unknown>,
) {
  const args = params.arguments as Record<string, unknown> | undefined;
  const delivery = params.delivery as
    | { mode?: string; url?: string; secret?: string }
    | undefined;
  if (
    params.name !== DOT_EVENT ||
    !args ||
    Object.keys(args).length ||
    delivery?.mode !== "webhook" ||
    !delivery.url ||
    !delivery.secret
  )
    throw new ApiError(400, "Suscripción inválida");
  signingKey(delivery.secret);
  const id = `sub_${hash(JSON.stringify([owner.companyId, owner.userId, delivery.url, DOT_EVENT, {}]))}`;
  await verifyCallback({ id, url: delivery.url, secret: delivery.secret });
  const ttl = params.ttlMs;
  if (
    ttl !== undefined &&
    ttl !== null &&
    (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0)
  )
    throw new ApiError(400, "ttlMs inválido");
  const expiry =
    ttl === null
      ? null
      : new Date(
          Date.now() +
            Math.min(
              typeof ttl === "number" ? ttl : 7 * 86400000,
              30 * 86400000,
            ),
        ).toISOString();
  const secretCipher = encryptDotSecret(delivery.secret);
  await withCompanyContext(owner.companyId, (client) =>
    client.query(
      `INSERT INTO supervisor_dot_subscriptions(id,empresa_id,user_id,callback_url,secret_cipher,expires_at) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET previous_secret_cipher=supervisor_dot_subscriptions.secret_cipher,rotated_at=now(),secret_cipher=EXCLUDED.secret_cipher,expires_at=EXCLUDED.expires_at,active=true`,
      [id, owner.companyId, owner.userId, delivery.url, secretCipher, expiry],
    ),
  );
  return { id, refreshBefore: expiry, cursor: null, truncated: false };
}
export async function unsubscribeDot(
  owner: AuthSession,
  params: Record<string, unknown>,
) {
  const args = params.arguments as Record<string, unknown> | undefined;
  const delivery = params.delivery as
    | { mode?: string; url?: string }
    | undefined;
  if (
    params.name !== DOT_EVENT ||
    !args ||
    Object.keys(args).length ||
    delivery?.mode !== "webhook" ||
    !delivery.url
  )
    throw new ApiError(400, "Suscripción inválida");
  await withCompanyContext(owner.companyId, (client) =>
    client.query(
      "UPDATE supervisor_dot_subscriptions SET active=false WHERE empresa_id=$1 AND user_id=$2 AND callback_url=$3",
      [owner.companyId, owner.userId, delivery.url],
    ),
  );
  return {};
}
export async function dispatchDotQuestions(session: AuthSession) {
  const subscriptions = await withCompanyContext(
    session.companyId,
    async (client) =>
      (
        await client.query<Subscription>(
          "SELECT * FROM supervisor_dot_subscriptions WHERE empresa_id=$1 AND active AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1",
          [session.companyId],
        )
      ).rows,
  );
  const subscription = subscriptions[0];
  if (!subscription) return;
  const ownerValid = await validateSessionIdentity({
    ...session,
    userId: subscription.user_id,
  });
  if (!ownerValid || !isAdminRole(ownerValid.role)) {
    await withCompanyContext(session.companyId, (client) =>
      client.query(
        "UPDATE supervisor_dot_subscriptions SET active=false WHERE id=$1",
        [subscription.id],
      ),
    );
    return;
  }
  const batch = await withCompanyContext(
    session.companyId,
    async (client) =>
      (
        await client.query<DotRequest>(
          `UPDATE supervisor_dot_requests SET delivery_lease_until=now()+interval '30 seconds'
    WHERE id IN (SELECT id FROM supervisor_dot_requests WHERE empresa_id=$1 AND state='pending' AND delivered_at IS NULL AND attempts<8 AND next_attempt_at<=now() AND expires_at>now() AND (delivery_lease_until IS NULL OR delivery_lease_until<now()) ORDER BY created_at LIMIT 3 FOR UPDATE SKIP LOCKED) RETURNING *`,
          [session.companyId],
        )
      ).rows,
  );
  await Promise.all(
    batch.map(async (row) => {
      let status = 503;
      try {
        const event = questionEvent({
          ...row,
          created_at: new Date(row.created_at).toISOString(),
        });
        const body = JSON.stringify(event);
        const signed = {
          id: subscription.id,
          secret: decryptDotSecret(subscription.secret_cipher),
        };
        const timestamp = Math.floor(Date.now() / 1000);
        const headers = signedHeaders(signed, event.eventId, body, timestamp);
        if (
          subscription.previous_secret_cipher &&
          subscription.rotated_at &&
          Date.now() - new Date(subscription.rotated_at).getTime() < 300000
        )
          headers["webhook-signature"] +=
            ` ${signedHeaders({ id: subscription.id, secret: decryptDotSecret(subscription.previous_secret_cipher) }, event.eventId, body, timestamp)["webhook-signature"]}`;
        status = (await postWebhook(subscription.callback_url, body, headers))
          .status;
      } catch {
        /* A transport failure only retries the included-plan connection. */
      }
      await withCompanyContext(session.companyId, async (client) => {
        if (terminalDelivery(status))
          await client.query(
            "UPDATE supervisor_dot_subscriptions SET active=false WHERE id=$1",
            [subscription.id],
          );
        await client.query(
          "UPDATE supervisor_dot_requests SET attempts=attempts+1,delivery_lease_until=NULL,delivered_at=CASE WHEN $3 THEN now() ELSE delivered_at END,next_attempt_at=now()+($4::int*interval '1 millisecond') WHERE empresa_id=$1 AND id=$2",
          [
            session.companyId,
            row.id,
            status >= 200 && status < 300,
            retryDelay(row.attempts),
          ],
        );
      });
    }),
  );
}
