import type { UIMessage } from "ai";

/** Failed turns can leave several consecutive user messages. Keep one current task. */
export function supervisorRequestContext(messages: readonly UIMessage[]) {
  const index = messages.findLastIndex((message) => message.role === "user");
  if (index < 0) throw new Error("Falta la consulta actual");
  const text = (message: UIMessage) => message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text).join("\n\n");
  return {
    currentQuestion: text(messages[index]),
    conversationContext: messages.slice(0, index).map((message) => ({ role: message.role, text: text(message) })),
  };
}

export function supervisorModelMessages<T extends UIMessage>(messages: readonly T[]): T[] {
  const context = supervisorRequestContext(messages);
  const current = messages.findLast((message) => message.role === "user")!;
  return [{ ...current, parts: [{ type: "text", text: JSON.stringify(context) }] } as T];
}
