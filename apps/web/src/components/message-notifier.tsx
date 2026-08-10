"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type IncomingMessage = {
  id: number;
  de: string;
  asunto: string;
  preview: string;
  tipo: string;
};

const POLL_MS = 30_000;
const AUTO_DISMISS_MS = 9_000;

// Aviso de mensaje nuevo en la esquina inferior derecha. Hace polling de los
// mensajes internos no leidos y muestra un toast cuando llega uno nuevo (no
// avisa los que ya estaban al abrir la app).
export function MessageNotifier() {
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<IncomingMessage[]>([]);
  const lastSeenId = useRef<number | null>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      // En la pantalla de mensajes no hace falta el aviso.
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const response = await fetch("/api/messages/recent", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok || !active) return;
        const data = (await response.json()) as { messages?: IncomingMessage[] };
        const messages = data.messages ?? [];
        if (!active || messages.length === 0) return;

        const maxId = Math.max(...messages.map((message) => message.id));
        if (lastSeenId.current === null) {
          // Primera carga: tomamos referencia sin avisar mensajes viejos.
          lastSeenId.current = maxId;
          return;
        }

        const fresh = messages
          .filter((message) => message.id > (lastSeenId.current ?? 0))
          .sort((a, b) => a.id - b.id);
        if (fresh.length > 0) {
          lastSeenId.current = maxId;
          if (pathname !== "/messages") {
            setToasts((prev) => [...prev, ...fresh].slice(-4));
          }
        }
      } catch {
        /* red caida: reintenta en el proximo ciclo */
      }
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[120] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      role="status"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-[msgToastIn_.18s_ease] flex items-start gap-3 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel)] p-3.5 shadow-[var(--shadow-md)]"
        >
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </span>
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              dismiss(toast.id);
              router.push("/messages");
            }}
            type="button"
          >
            <span className="erp-text-body-sm block truncate font-semibold text-[color:var(--foreground)]">
              {toast.de || "Mensaje nuevo"}
            </span>
            {toast.asunto ? (
              <span className="erp-text-body-sm block truncate text-[color:var(--foreground)]">{toast.asunto}</span>
            ) : null}
            <span className="erp-text-caption block truncate text-[color:var(--muted)]">{toast.preview}</span>
          </button>
          <button
            aria-label="Cerrar aviso"
            className="erp-text-caption shrink-0 rounded-md px-1.5 py-0.5 text-[color:var(--muted)] hover:bg-[color:var(--hover)] hover:text-[color:var(--foreground)]"
            onClick={() => dismiss(toast.id)}
            type="button"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
