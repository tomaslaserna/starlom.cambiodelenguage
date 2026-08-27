import "server-only";

import type { UIMessage } from "ai";
import type { AuthSession } from "@/lib/auth";
import { withCompanyContext } from "@/lib/db";
import type { StarlimSupervisorMessage } from "@/lib/supervisor-lab/agent";

export const SUPERVISOR_MEMORY_HOURS = 48;
export const SUPERVISOR_MEMORY_MAX_MESSAGES = 200;

type StoredMessageRow = {
  message: unknown;
};

function isStoredMessage(value: unknown): value is StarlimSupervisorMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<UIMessage>;
  return (
    typeof message.id === "string" &&
    message.id.length > 0 &&
    message.id.length <= 200 &&
    (message.role === "user" || message.role === "assistant") &&
    Array.isArray(message.parts)
  );
}

function boundedMessages(messages: StarlimSupervisorMessage[]) {
  return messages.filter(isStoredMessage).slice(-SUPERVISOR_MEMORY_MAX_MESSAGES);
}

export async function getSupervisorChatMemory(session: AuthSession) {
  return withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `DELETE FROM supervisor_chat_messages
       WHERE empresa_id = $1 AND expires_at <= NOW()`,
      [session.companyId],
    );

    const result = await client.query<StoredMessageRow>(
      `SELECT message
       FROM supervisor_chat_messages
       WHERE empresa_id = $1
         AND user_id = $2::uuid
         AND expires_at > NOW()
       ORDER BY updated_at ASC, sequence_index ASC
       LIMIT $3`,
      [session.companyId, session.userId, SUPERVISOR_MEMORY_MAX_MESSAGES],
    );

    return result.rows.map((row) => row.message).filter(isStoredMessage);
  });
}

export async function saveSupervisorChatMemory(
  session: AuthSession,
  messages: StarlimSupervisorMessage[],
) {
  const bounded = boundedMessages(messages);
  if (!bounded.length) return;

  await withCompanyContext(session.companyId, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`supervisor-chat:${session.companyId}:${session.userId}`],
    );
    await client.query(
      `DELETE FROM supervisor_chat_messages
       WHERE empresa_id = $1 AND expires_at <= NOW()`,
      [session.companyId],
    );

    for (const [index, message] of bounded.entries()) {
      await client.query(
        `INSERT INTO supervisor_chat_messages (
           empresa_id, user_id, message_id, role, message, sequence_index, model
         )
         VALUES ($1, $2::uuid, $3, $4, $5::jsonb, $6, $7)
         ON CONFLICT (empresa_id, user_id, message_id)
         DO UPDATE SET
           role = EXCLUDED.role,
           message = EXCLUDED.message,
           sequence_index = EXCLUDED.sequence_index,
           model = EXCLUDED.model,
           updated_at = NOW()`,
        [
          session.companyId,
          session.userId,
          message.id,
          message.role,
          JSON.stringify(message),
          index,
          process.env.SUPERVISOR_AI_MODEL || "google/gemini-3.5-flash",
        ],
      );
    }

    await client.query(
      `DELETE FROM supervisor_chat_messages
       WHERE id IN (
         SELECT id
         FROM supervisor_chat_messages
         WHERE empresa_id = $1 AND user_id = $2::uuid
         ORDER BY updated_at DESC, sequence_index DESC
         OFFSET $3
       )`,
      [session.companyId, session.userId, SUPERVISOR_MEMORY_MAX_MESSAGES],
    );
  });
}

export async function clearSupervisorChatMemory(session: AuthSession) {
  await withCompanyContext(session.companyId, (client) =>
    client.query(
      `DELETE FROM supervisor_chat_messages
       WHERE empresa_id = $1 AND user_id = $2::uuid`,
      [session.companyId, session.userId],
    ),
  );
}
