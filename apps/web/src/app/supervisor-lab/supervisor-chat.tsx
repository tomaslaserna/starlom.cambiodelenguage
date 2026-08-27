"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { Button, Card, Textarea } from "@/components/ui";
import { MessageResponse } from "@/components/ai-elements/message";
import type { StarlimSupervisorMessage } from "@/lib/supervisor-lab/agent";

function toolLabel(toolName: string) {
  return {
    searchCustomers: "Buscando clientes",
    getCustomerHistory: "Consultando historial",
    getCustomerProductPattern: "Analizando patrón de compra",
    getOperationalSnapshot: "Revisando pendientes",
    getWorkPriorities: "Preparando tus prioridades",
  }[toolName] ?? "Consultando el ERP";
}

export function SupervisorChat({ quickPrompts }: { quickPrompts: string[] }) {
  const [input, setInput] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const transport = useMemo(
    () => new DefaultChatTransport<StarlimSupervisorMessage>({ api: "/api/supervisor-lab/chat" }),
    [],
  );
  const { messages, sendMessage, status, error, stop, setMessages } = useChat<StarlimSupervisorMessage>({
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) return;
    const timeoutId = window.setTimeout(() => {
      setTimedOut(true);
      void stop();
    }, 48_000);
    return () => window.clearTimeout(timeoutId);
  }, [busy, stop]);

  function submitText(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setTimedOut(false);
    void sendMessage({ text: value });
    setInput("");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitText(input);
  }

  return (
    <div className="mx-auto grid min-w-0 w-full max-w-5xl gap-4 overflow-hidden">
      <Card className="border-[#cbdcf7] bg-[linear-gradient(135deg,#f7fbff_0%,#eef5ff_100%)] p-5 text-center">
        <div className="mx-auto grid max-w-2xl gap-2">
          <span className="mx-auto rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-[#075ac7]">
            Asistente interno · solo lectura
          </span>
          <h2 className="text-xl font-extrabold text-[#0f172a]">LA TIRRA ia.01</h2>
          <p className="text-sm font-medium text-[#64748b]">
            Consulta clientes, compras habituales, pedidos y decisiones fiscales. No puede modificar datos.
          </p>
        </div>
      </Card>

      <div className="flex min-w-0 flex-wrap justify-center gap-2">
        {quickPrompts.map((prompt) => (
          <Button className="max-w-full whitespace-normal text-center" key={prompt} disabled={busy} onClick={() => submitText(prompt)} size="sm" type="button" variant="secondary">
            {prompt}
          </Button>
        ))}
      </div>

      <Card className="grid min-h-[420px] min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden sm:min-h-[480px]">
        <div aria-live="polite" className="grid min-h-[320px] min-w-0 content-start gap-4 overflow-x-hidden overflow-y-auto p-3 sm:p-5 lg:max-h-[58vh]">
          {messages.length === 0 ? (
            <div className="m-auto max-w-md py-20 text-center text-sm font-medium text-[#64748b]">
              Escribí una consulta o elegí una sugerencia. Cada respuesta debe basarse en información trazable del ERP.
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              className={message.role === "user" ? "ml-auto min-w-0 max-w-[92%] sm:max-w-[85%]" : "mr-auto min-w-0 max-w-full sm:max-w-[92%]"}
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
                        {toolLabel(getToolName(part))} · {part.state === "output-available" ? "listo" : "en curso"}
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
              La consulta superó los 48 segundos y fue detenida. Probá nuevamente o usá el enlace sugerido; LA TIRRA ia.01 no debe quedar pensando indefinidamente.
            </div>
          ) : null}
        </div>

        <form className="grid min-w-0 gap-3 border-t border-[#d9e2ef] bg-[#f8fafc] p-3 sm:p-4" onSubmit={onSubmit}>
          <Textarea
            aria-label="Consulta para LA TIRRA ia.01"
            disabled={busy}
            maxLength={2000}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Ejemplo: ¿qué suele comprar La Cascada?"
            rows={3}
            value={input}
          />
          <div className="flex flex-wrap justify-center gap-2">
            {busy ? (
              <Button onClick={() => void stop()} type="button" variant="secondary">Detener</Button>
            ) : (
              <Button disabled={!input.trim()} type="submit">Consultar</Button>
            )}
            <Button disabled={busy || messages.length === 0} onClick={() => { setMessages([]); setTimedOut(false); }} type="button" variant="secondary">
              Nueva conversación
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
