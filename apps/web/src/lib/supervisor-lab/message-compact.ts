import type { UIMessage } from "ai";

export const SUPERVISOR_CHAT_CONTEXT_MAX_MESSAGES = 12;
export const SUPERVISOR_CHAT_MESSAGE_MAX_CHARACTERS = 2_500;

function messageText(message: UIMessage) {
  const textParts: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && part.text.trim()) textParts.push(part.text.trim());
  }
  return textParts.join("\n\n");
}

/**
 * Conserva solamente el contexto que el modelo necesita para continuar la charla.
 * Los mensajes del proveedor pueden contener firmas de razonamiento y resultados de
 * herramientas muy grandes; nunca deben volver al navegador ni a la siguiente petición.
 */
export function compactSupervisorMessages<T extends UIMessage>(
  messages: readonly T[],
  maxMessages = SUPERVISOR_CHAT_CONTEXT_MAX_MESSAGES,
): T[] {
  return messages
    .slice(-maxMessages)
    .map((message) => {
      const text = messageText(message).slice(0, SUPERVISOR_CHAT_MESSAGE_MAX_CHARACTERS);
      if (!text) return null;
      return {
        id: message.id,
        role: message.role,
        parts: [{ type: "text", text }],
      } as T;
    })
    .filter((message): message is T => message !== null);
}
