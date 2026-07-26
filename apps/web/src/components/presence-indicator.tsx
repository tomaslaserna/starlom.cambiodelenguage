"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/components/ui";
import type { OnlineUser, PresenceSnapshot } from "@/lib/presence";

const HEARTBEAT_MS = 30_000;

async function heartbeat(signal: AbortSignal): Promise<PresenceSnapshot> {
  const response = await fetch("/api/presence", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: PresenceSnapshot;
  };
  if (!response.ok || !payload.data) {
    throw new Error("No se pudo actualizar la presencia");
  }
  return { count: payload.data.count ?? 0, online: payload.data.online ?? [] };
}

export function PresenceIndicator({ compact = false }: { compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let controller = new AbortController();

    const tick = async () => {
      controller.abort();
      controller = new AbortController();
      try {
        const next = await heartbeat(controller.signal);
        if (active) setSnapshot(next);
      } catch {
        // Keep the last known snapshot on transient errors.
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const loaded = snapshot !== null;
  const count = snapshot?.count ?? 0;
  const online: OnlineUser[] = snapshot?.online ?? [];
  const others = online.filter((user) => !user.isSelf);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Ver usuarios conectados (${count} online)`}
        className={cn(
          "erp-text-caption flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel)] px-3 shadow-[var(--shadow-sm)] transition-colors hover:border-[color:var(--accent)]",
          compact && "px-2",
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-2 w-2 rounded-full",
            count > 0 ? "bg-[#22c55e]" : "bg-[color:var(--muted)]",
          )}
        />
        <span className="font-semibold">{loaded ? count : "–"}</span>
        {compact ? null : <span className="text-[color:var(--muted)]">online</span>}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white text-left shadow-[var(--shadow-lg)]"
          role="dialog"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--border)] px-3 py-2">
            <span className="erp-text-caption font-bold text-[#0f172a]">Conectados</span>
            <span className="erp-text-caption font-semibold text-[color:var(--muted)]">{count}</span>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {online.map((user) => (
              <li
                className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-[#f8fbff]"
                key={user.username}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#22c55e]" />
                  <span className="truncate text-sm font-semibold text-[#172033]">
                    {user.displayName}
                    {user.isSelf ? <span className="font-medium text-[color:var(--muted)]"> (vos)</span> : null}
                  </span>
                </span>
                {user.isSelf ? null : (
                  <Link
                    className="shrink-0 rounded-md bg-[#eaf2ff] px-2.5 py-1 text-xs font-bold text-[#2563eb] hover:bg-[#dbe8ff]"
                    href={`/messages?contact=${encodeURIComponent(user.username)}`}
                    onClick={() => setOpen(false)}
                  >
                    Mensaje
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {others.length === 0 ? (
            <p className="border-t border-[color:var(--border)] px-3 py-2 text-xs font-medium text-[color:var(--muted)]">
              {loaded ? "Nadie más conectado por ahora." : "Buscando conectados…"}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
