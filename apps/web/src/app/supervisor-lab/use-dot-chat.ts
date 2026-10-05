"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StarlimSupervisorMessage } from "@/lib/supervisor-lab/agent";
type Pending = { id: string; delivered: boolean } | null;
export function useDotChat() {
  const [messages, setMessages] = useState<StarlimSupervisorMessage[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = ++refreshVersion.current;
    try {
      const response = await fetch("/api/supervisor-lab/chat", {
        cache: "no-store",
        signal,
      });
      const body = await response.json();
      if (!response.ok || !body.ok || !Array.isArray(body.messages))
        throw new Error(body.error || "No se pudo recuperar la conversación");
      if (
        mounted.current &&
        !signal?.aborted &&
        version === refreshVersion.current
      ) {
        setMessages(body.messages);
        setPending(body.pending ?? null);
        setConnected(body.connected === true);
        setError(null);
      }
    } catch (cause) {
      if (
        mounted.current &&
        !signal?.aborted &&
        version === refreshVersion.current
      )
        setError(
          cause instanceof Error
            ? cause
            : new Error("No se pudo consultar el estado"),
        );
    } finally {
      if (
        mounted.current &&
        !signal?.aborted &&
        version === refreshVersion.current
      )
        setLoadingHistory(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);
  const pendingId = pending?.id;
  useEffect(() => {
    if (!pendingId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    }
    timer = setTimeout(poll, 1500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pendingId, refresh]);
  const sendMessage = useCallback(
    async ({ text }: { text: string }) => {
      if (pending || submitting) return;
      const message = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      } as StarlimSupervisorMessage;
      setSubmitting(true);
      setError(null);
      setMessages((current) => [...current, message]);
      try {
        const response = await fetch("/api/supervisor-lab/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [message] }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "No se pudo enviar la consulta");
        if (mounted.current) {
          setPending(
            body.state === "pending"
              ? { id: body.requestId, delivered: false }
              : null,
          );
          await refresh();
        }
      } catch (cause) {
        if (mounted.current) {
          await refresh();
          setError(
            cause instanceof Error
              ? cause
              : new Error("No se pudo enviar la consulta"),
          );
        }
      } finally {
        if (mounted.current) setSubmitting(false);
      }
    },
    [pending, submitting, refresh],
  );
  const stop = useCallback(async () => {
    try {
      const response = await fetch("/api/supervisor-lab/chat", {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("No se pudo detener la consulta");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause
          : new Error("No se pudo detener la consulta"),
      );
    }
  }, [refresh]);
  return {
    messages,
    setMessages,
    sendMessage,
    stop,
    error,
    loadingHistory,
    connected,
    pending,
    status: submitting ? "submitted" : pending ? "streaming" : "ready",
  };
}
