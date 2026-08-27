import { ApiError } from "@/lib/api-response";

const MAX_MESSAGES = 30;
const MAX_BODY_CHARACTERS = 60_000;

export function parseSupervisorRequestBody(value: unknown) {
  if (!value || typeof value !== "object") throw new ApiError(400, "Solicitud invalida");
  const messages = (value as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ApiError(400, "Se necesita al menos un mensaje");
  }
  if (messages.length > MAX_MESSAGES) throw new ApiError(413, "La conversacion es demasiado extensa");
  if (JSON.stringify(messages).length > MAX_BODY_CHARACTERS) {
    throw new ApiError(413, "El contenido de la conversacion es demasiado grande");
  }
  return messages;
}
