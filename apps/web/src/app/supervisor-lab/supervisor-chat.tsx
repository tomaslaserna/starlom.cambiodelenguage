"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { Button, Card, Textarea } from "@/components/ui";
import { MessageResponse } from "@/components/ai-elements/message";
import type { StarlimSupervisorMessage } from "@/lib/supervisor-lab/agent";

const CAPABILITIES = [
  {
    number: "01",
    eyebrow: "Información del ERP",
    title: "Preguntame sobre el sistema",
    description: "Ventas, saldos, facturas, pedidos, stock, clientes y pendientes con enlaces para verificar.",
    example: "¿Cuánto vendimos este mes y dónde lo verifico?",
  },
  {
    number: "02",
    eyebrow: "Manual Starlim",
    title: "Preguntame cómo trabajamos",
    description: "Te explico cada circuito, qué ocurre después y qué controles tenés que realizar.",
    example: "¿Cómo registro una devolución y qué modifica?",
  },
  {
    number: "03",
    eyebrow: "Productos y limpieza",
    title: "Pedime una solución de limpieza",
    description: "Analizo mancha, superficie y ambiente, y busco alternativas disponibles en nuestro catálogo.",
    example: "¿Cómo saco grasa de un piso cerámico y qué producto puedo ofrecer?",
  },
  {
    number: "04",
    eyebrow: "Atención al cliente",
    title: "Pedime ayuda para responder",
    description: "Paso pedidos informales en limpio y preparo respuestas breves para asesorar mejor al cliente.",
    example: "Ordená este pedido de WhatsApp e indicame qué quiso pedir el cliente.",
  },
] as const;

function toolLabel(toolName: string) {
  return {
    searchCustomers: "Buscando clientes",
    getCustomerHistory: "Consultando historial",
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

export function SupervisorChat({ quickPrompts }: { quickPrompts: string[] }) {
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
        body: { messages: messages.slice(-30) },
      }),
    }),
    [],
  );
  const { messages, sendMessage, status, error, stop, setMessages } = useChat<StarlimSupervisorMessage>({
    transport,
  });
  const busy = status === "submitted" || status === "streaming";

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
    }, 32_000);
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
    setTimedOut(false);
    void sendMessage({ text: value });
    setInput("");
    window.requestAnimationFrame(() => {
      document.getElementById("tirra-conversation")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
    <div className="mx-auto grid min-w-0 w-full gap-5 overflow-hidden">
      <Card className="relative overflow-hidden border-[#bcd3f3] bg-[linear-gradient(135deg,#075ac7_0%,#0b75e5_62%,#0f8ee9_100%)] p-0 text-white shadow-[0_20px_45px_rgba(7,90,199,0.16)]">
        <div aria-hidden="true" className="absolute -right-16 -top-20 h-64 w-64 rounded-full border-[36px] border-white/5" />
        <div aria-hidden="true" className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
        <div className="relative grid gap-7 p-5 sm:p-7">
          <div className="grid max-w-3xl gap-3">
            <span className="w-fit rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-white">
              Tu asistente de trabajo · versión 1.1
            </span>
            <div className="grid gap-2">
              <h2 className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">Hola, soy LA TIRRA.</h2>
              <p className="max-w-2xl text-sm font-medium leading-6 text-blue-50 sm:text-base">
                No necesitás aprender comandos ni saber dónde está cada dato. Escribime como hablarías con un compañero y yo busco, explico o te ayudo a responder.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {CAPABILITIES.map((capability) => (
              <button
                className="group grid min-h-40 gap-3 rounded-2xl border border-white/20 bg-white/[0.11] p-4 text-left shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/[0.17] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy || loadingHistory}
                key={capability.number}
                onClick={() => submitText(capability.example)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black tracking-[0.16em] text-blue-100">{capability.eyebrow}</span>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-black text-[#075ac7]">{capability.number}</span>
                </div>
                <div className="grid gap-1">
                  <strong className="text-base font-extrabold text-white">{capability.title}</strong>
                  <span className="text-sm leading-5 text-blue-50/90">{capability.description}</span>
                </div>
                <span className="mt-auto text-xs font-bold text-white/80 transition group-hover:text-white">Probar con un ejemplo →</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {quickPrompts.length ? (
        <section aria-labelledby="recommended-questions" className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2 px-1">
            <div>
              <h3 className="text-sm font-extrabold text-[#0f172a]" id="recommended-questions">Sugerencias para vos</h3>
              <p className="text-xs font-medium text-[#64748b]">Preguntas preparadas según tu función y tus pendientes.</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <Button className="max-w-full whitespace-normal text-left" key={prompt} disabled={busy || loadingHistory} onClick={() => submitText(prompt)} size="sm" type="button" variant="secondary">
                {prompt}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <Card
        aria-label="Área de conversación con LA TIRRA"
        className={expandedChat
          ? "fixed inset-3 z-[80] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-[#c9d8ec] shadow-[0_28px_80px_rgba(15,23,42,0.28)] sm:inset-6"
          : "grid h-[900px] min-h-[84vh] min-w-0 scroll-mt-5 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-[#c9d8ec] shadow-[0_18px_44px_rgba(15,23,42,0.08)] sm:h-[980px] lg:h-[1080px]"}
        id="tirra-conversation"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e2ef] bg-white px-4 py-3 sm:px-6">
          <div>
            <h3 className="text-base font-extrabold text-[#0f172a]">Conversación con LA TIRRA</h3>
            <p className="text-xs font-medium text-[#64748b]">Tus respuestas y consultas de las últimas 48 horas.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full bg-[#ecfdf5] px-3 py-1.5 text-xs font-extrabold text-[#047857] sm:inline-flex">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#10b981]" /> Lista para ayudarte
            </span>
            <Button onClick={() => setExpandedChat((current) => !current)} size="sm" type="button" variant="secondary">
              {expandedChat ? "Volver al tamaño normal" : "Ampliar lectura"}
            </Button>
          </div>
        </div>
        <div aria-live="polite" className="grid min-h-0 min-w-0 content-start gap-5 overflow-x-hidden overflow-y-auto bg-[#fbfdff] p-4 sm:p-6 lg:p-7">
          {loadingHistory ? (
            <div className="m-auto max-w-md py-20 text-center text-sm font-semibold text-[#64748b]">
              Recuperando tu conversación de las últimas 48 horas…
            </div>
          ) : messages.length === 0 ? (
            <div className="m-auto max-w-md py-20 text-center text-sm font-medium text-[#64748b]">
              <strong className="mb-2 block text-base text-[#0f172a]">¿Qué necesitás resolver?</strong>
              Escribí la consulta con tus propias palabras o elegí una opción de arriba. Si me falta un dato importante, te lo voy a preguntar.
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
              La consulta superó los 32 segundos y fue detenida. Probá nuevamente; LA TIRRA ia.1.1 no debe quedar pensando indefinidamente.
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
            placeholder="Escribime con tus palabras. Ejemplo: ¿qué producto le ofrezco para sacar sarro de una grifería?"
            rows={2}
            value={input}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#64748b]">Enter para consultar · Shift + Enter para otra línea</span>
            <div className="flex flex-wrap justify-center gap-2">
            {busy ? (
              <Button onClick={() => void stop()} type="button" variant="secondary">Detener</Button>
            ) : (
              <Button disabled={!input.trim() || loadingHistory} type="submit">Consultar</Button>
            )}
            <Button disabled={busy || clearingHistory || loadingHistory || messages.length === 0} onClick={() => void startNewConversation()} type="button" variant="secondary">
              {clearingHistory ? "Borrando…" : "Nueva conversación"}
            </Button>
            </div>
          </div>
          <p className="text-center text-xs font-semibold text-[#64748b]">
            Memoria privada del operador · se conserva por un máximo de 48 horas
          </p>
        </form>
      </Card>
    </div>
  );
}
