"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type MessageNotificationItem = {
  id: number;
  from: string;
  to: string;
  subject: string;
  bodyPreview: string;
  date: string;
  read: boolean;
};

type MessageNotificationsProps = {
  currentUsername: string;
  initialUnread: number;
  initialLatestMessage: MessageNotificationItem | null;
  initialRevision: string;
};

const MESSAGE_NOTIFICATION_INTERVAL_MS = 3_000;

function latestFirst(messages: MessageNotificationItem[]) {
  return [...messages].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
}

function previewText(message: MessageNotificationItem) {
  const value = message.bodyPreview.trim() || message.subject.trim() || "Te envio un mensaje";
  return value.length > 150 ? `${value.slice(0, 147)}...` : value;
}

export function MessageNotifications({
  currentUsername,
  initialUnread,
  initialLatestMessage,
  initialRevision,
}: MessageNotificationsProps) {
  const [notification, setNotification] = useState(() => ({
    unread: initialUnread,
    latest: initialLatestMessage,
  }));
  const revisionRef = useRef(initialRevision);
  const revisionInFlightRef = useRef(false);

  const refreshUnreadMessages = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/messages", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { inbox?: MessageNotificationItem[]; meta?: { revision?: string } };
    };
    if (!response.ok || !payload.data) throw new Error("No se pudieron comprobar los mensajes");

    const unreadMessages = latestFirst(
      (payload.data.inbox ?? []).filter(
        (message) => message.to === currentUsername && !message.read,
      ),
    );
    setNotification({ unread: unreadMessages.length, latest: unreadMessages[0] ?? null });
    if (payload.data.meta?.revision) revisionRef.current = payload.data.meta.revision;
  }, [currentUsername]);

  const refreshWhenChanged = useCallback(async (signal?: AbortSignal) => {
    if (revisionInFlightRef.current) return;
    revisionInFlightRef.current = true;
    try {
      const response = await fetch("/api/messages?mode=revision", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal,
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: { revision?: string } };
      const revision = payload.data?.revision;
      if (!response.ok || !revision) throw new Error("No se pudo comprobar si hay mensajes nuevos");
      if (revision !== revisionRef.current) await refreshUnreadMessages(signal);
    } finally {
      revisionInFlightRef.current = false;
    }
  }, [refreshUnreadMessages]);

  useEffect(() => {
    const controller = new AbortController();
    // The server uses a tight budget so messages cannot block navigation. Refresh
    // in the background as soon as the new page becomes interactive.
    void refreshWhenChanged(controller.signal).catch(() => undefined);
    const interval = window.setInterval(() => {
      if (!navigator.onLine) return;
      void refreshWhenChanged(controller.signal).catch(() => undefined);
    }, MESSAGE_NOTIFICATION_INTERVAL_MS);
    const onOnline = () => void refreshWhenChanged(controller.signal).catch(() => undefined);
    window.addEventListener("online", onOnline);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, [refreshWhenChanged]);

  const latestMessage = notification.latest;
  if (!latestMessage) return null;

  return (
    <aside
      aria-label={`${notification.unread} mensaje(s) sin leer`}
      className="group fixed bottom-5 right-5 z-50 flex items-end justify-end"
    >
      <Link
        aria-label="Abrir mensajes sin leer"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0b6cff] text-white shadow-[0_12px_28px_rgba(7,63,148,0.35)] transition-transform hover:scale-105 focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#bfdbfe]"
        href="/messages"
      >
        <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path d="M20 11.5a7.5 7.5 0 0 1-11.06 6.6L4 20l1.9-4.34A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
        </svg>
        <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#dc2626] px-1 text-[11px] font-black text-white">
          {notification.unread > 99 ? "99+" : notification.unread}
        </span>
      </Link>

      <Link
        className="pointer-events-none absolute bottom-0 right-16 w-80 translate-x-2 rounded-[12px] border border-[#bfdbfe] bg-white p-4 opacity-0 shadow-[0_14px_32px_rgba(15,23,42,0.18)] transition-[opacity,transform] group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100"
        href="/messages"
      >
        <p className="text-xs font-black uppercase tracking-wide text-[#075ac7]">
          {notification.unread === 1 ? "Nuevo mensaje" : `${notification.unread} mensajes sin leer`}
        </p>
        <p className="mt-1 text-sm font-black text-[#0f172a]">{latestMessage.from}</p>
        <p className="mt-1 line-clamp-3 text-sm font-medium leading-5 text-[#475569]">{previewText(latestMessage)}</p>
        <p className="mt-3 text-xs font-bold text-[#075ac7]">Abrir conversación</p>
      </Link>
    </aside>
  );
}
