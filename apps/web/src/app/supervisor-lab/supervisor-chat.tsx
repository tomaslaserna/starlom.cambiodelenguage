"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { Button, Card, Textarea } from "@/components/ui";
import { MessageResponse } from "@/components/ai-elements/message";
import type { StarlimSupervisorMessage } from "@/lib/supervisor-lab/agent";
import { compactSupervisorMessages } from "@/lib/supervisor-lab/message-compact";
import { supervisorToolStateLabel } from "@/lib/supervisor-lab/tool-state";

function toolLabel(toolName: string) {
  return {
    searchCustomers: "Buscando clientes",
    getCustomerHistory: "Consultando historial",
    getCustomerOrderSummary: "Calculando frecuencia e importes",
    getCustomerCommercialBrief: "Preparando resumen comercial",
    getCustomerDocuments: "Buscando comprobantes",
    getCustomerAccountBalance: "Consultando cuenta corriente",
    getCustomerInvoices: "Buscando facturas",
    getInvoiceByNumber: "Buscando comprobante fiscal",
    getCustomerProductPattern: "Analizando patrón de compra",
    getOperationalSnapshot: "Revisando pendientes",
    getWorkPriorities: "Preparando tus prioridades",
    getSalesMetrics: "Calculando ventas",
    getErpGuide: "Buscando la pantalla correcta",
    searchCompanyManual: "Consultando el manual Starlim",
    getCleaningAdvice: "Analizando la solución de limpieza",
  }[toolName] ?? "Consultando el ERP";
}

export function SupervisorChat() {
  const conversationRef = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const [input, setInput] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const [expandedChat, setExpandedChat] = useState(false);
  const transport = useMemo(
    () => new DefaultChatTransport<StarlimSupervisorMessage>({
      api: "/api/supervisor-lab/chat",
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { messages: compactSupervisorMessages(messages.slice(-30)) },
      }),
    }),
    [],
  );
  const { messages, sendMessage, status, error, stop, setMessages } = useChat<StarlimSupervisorMessage>({
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  const lastMessage = messages.at(-1);
  const completedWithoutText = !busy
    && lastMessage?.role === "assistant"
    && lastMessage.parts.some((part) => isToolUIPart(part) && part.state === "output-available")
    && !lastMessage.parts.some((part) => part.type === "text" && part.text.trim().length > 0);
  const lastUserText = [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.parts.find((part) => part.type === "text")?.text ?? "";

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation || loadingHistory || !followConversation.current) return;
    conversation.scrollTop = conversation.scrollHeight;
  }, [messages, status, loadingHistory]);

  useEffect(() => {
    const controller = new AbortController();
    async function restoreHistory() {
      try {
        const response = await fetch("/api/supervisor-lab/chat", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          ok?: boolean;
          messages?: StarlimSupervisorMessage[];
        };
        if (!response.ok || !body.ok || !Array.isArray(body.messages)) {
          throw new Error("No se pudo recuperar la conversación");
        }
        setMessages(body.messages);
      } catch (historyError) {
        if (!controller.signal.aborted) {
          setMemoryError(
            historyError instanceof Error
              ? historyError.message
              : "No se pudo recuperar la conversación",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingHistory(false);
      }
    }
    void restoreHistory();
    return () => controller.abort();
  }, [setMessages]);

  useEffect(() => {
    if (!busy) return;
    const timeoutId = window.setTimeout(() => {
      setTimedOut(true);
      void stop();
    }, 75_000);
    return () => window.clearTimeout(timeoutId);
  }, [busy, stop]);

  useEffect(() => {
    if (!expandedChat) return;
    function closeExpandedChat(event: KeyboardEvent) {
      if (event.key === "Escape") setExpandedChat(false);
    }
    window.addEventListener("keydown", closeExpandedChat);
    return () => window.removeEventListener("keydown", closeExpandedChat);
  }, [expandedChat]);

  function submitText(text: string) {
    const value = text.trim();
    if (!value || busy || loadingHistory) return;
    followConversation.current = true;
    setTimedOut(false);
    void sendMessage({ text: value });
    setInput("");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitText(input);
  }

  async function startNewConversation() {
    if (busy || clearingHistory) return;
    setClearingHistory(true);
    setMemoryError("");
    try {
      const response = await fetch("/api/supervisor-lab/chat", { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo borrar la conversación anterior");
      setMessages([]);
      setTimedOut(false);
    } catch (clearError) {
      setMemoryError(
        clearError instanceof Error
          ? clearError.message
          : "No se pudo borrar la conversación anterior",
      );
    } finally {
      setClearingHistory(false);
    }
  }

  return (
    <Card
      aria-label="Área de conversación con LA TIRRA"
      className={expandedChat
        ? "fixed inset-3 z-[80] grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-[#c9d8ec] shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:inset-6"
        : "grid h-[calc(100dvh-10.5rem)] min-h-56 min-w-0 scroll-mt-5 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-[#c9d8ec] shadow-[0_18px_44px_rgba(15,23,42,0.08)] lg:h-[calc(100dvh-7.25rem)]"}
      id="tirra-conversation"
    >
      <div
        aria-live="polite"
        ref={conversationRef}
        onScroll={(event) => {
          const container = event.currentTarget;
          followConversation.current = container.scrollHeight - container.scrollTop - container.clientHeight < 96;
        }}
        className="grid min-h-0 min-w-0 content-start gap-5 overflow-x-hidden overflow-y-auto bg-white p-4 sm:p-6 lg:p-7"
      >
        {loadingHistory ? (
          <div className="sr-only">
            Recuperando tu conversación de las últimas 48 horas…
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            className={message.role === "user" ? "ml-auto min-w-0 max-w-[92%] sm:max-w-[76%]" : "mr-auto min-w-0 max-w-[1100px]"}
            key={message.id}
          >
            <div
              className={
                message.role === "user"
                  ? "min-w-0 break-words rounded-[14px] bg-[#075ac7] px-3 py-3 text-sm font-medium text-white shadow-sm sm:px-4"
                  : "grid min-w-0 gap-2 overflow-hidden break-words rounded-[14px] border border-[#d9e2ef] bg-white px-3 py-3 text-sm text-[#0f172a] shadow-sm sm:px-4"
              }
            >
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  return message.role === "assistant" ? (
                    <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>
                  ) : (
                    <div className="whitespace-pre-wrap leading-6" key={`${message.id}-${index}`}>{part.text}</div>
                  );
                }
                if (part.type === "source-url") {
                  return (
                    <a className="font-bold text-[#075ac7] underline" href={part.url} key={`${message.id}-${index}`} rel="noreferrer" target="_blank">
                      {part.title ?? "Fuente"}
                    </a>
                  );
                }
                if (isToolUIPart(part)) {
                  return (
                    <div className="rounded-lg bg-[#f1f5f9] px-3 py-2 text-xs font-bold text-[#475569]" key={part.toolCallId}>
                      {toolLabel(getToolName(part))} · {supervisorToolStateLabel(part.state, busy)}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {error ? (
          <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-semibold text-[#b91c1c]">
            No se pudo completar la consulta. Reintentá o avisá al administrador.
          </div>
        ) : null}
        {timedOut ? (
          <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm font-semibold text-[#92400e]">
            La consulta superó los 75 segundos y fue detenida. Probá nuevamente; LA TIRRA ia.1.1 no debe quedar pensando indefinidamente.
          </div>
        ) : null}
        {completedWithoutText ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm font-semibold text-[#92400e]">
            <span>La consulta terminó, pero no se redactó la respuesta. No sigue procesando.</span>
            <Button disabled={!lastUserText} onClick={() => submitText(lastUserText)} size="sm" type="button" variant="secondary">
              Reintentar respuesta
            </Button>
          </div>
        ) : null}
        {memoryError ? (
          <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm font-semibold text-[#92400e]">
            {memoryError}. Podés seguir usando LA TIRRA, pero este historial podría no conservarse.
          </div>
        ) : null}
      </div>

      <form className="grid min-w-0 gap-3 border-t border-[#d9e2ef] bg-[#f8fafc] p-3 sm:p-4" onSubmit={onSubmit}>
        <Textarea
          aria-label="Consulta para LA TIRRA ia.1.1"
          disabled={busy || loadingHistory}
          maxLength={2000}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitText(input);
            }
          }}
          placeholder="Escribí tu consulta…"
          rows={2}
          value={input}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(messages.length > 0 || expandedChat) && (
            <Button onClick={() => setExpandedChat((current) => !current)} size="sm" type="button" variant="secondary">
              {expandedChat ? "Volver al tamaño normal" : "Ampliar lectura"}
            </Button>
          )}
          {messages.length > 0 && (
            <Button disabled={busy || clearingHistory || loadingHistory} onClick={() => void startNewConversation()} size="sm" type="button" variant="secondary">
              {clearingHistory ? "Borrando…" : "Nueva conversación"}
            </Button>
          )}
          {busy ? (
            <Button onClick={() => void stop()} type="button" variant="secondary">Detener</Button>
          ) : (
            <Button disabled={!input.trim() || loadingHistory} type="submit">Consultar</Button>
          )}
        </div>
      </form>
    </Card>
  );
}
