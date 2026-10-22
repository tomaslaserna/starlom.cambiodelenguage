"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppIcon, cn } from "@/components/ui";
import {
  type OperationalNotification,
  type OperationalNotificationSnapshot,
} from "@/lib/operational-notifications";

type NotificationBellProps = {
  initialSnapshot: OperationalNotificationSnapshot;
  compact?: boolean;
};

const POLL_INTERVAL_MS = 60_000;

function notificationTone(priority: OperationalNotification["priority"]) {
  if (priority === "urgent") return "border-l-[#dc2626] bg-[#fff7f7]";
  if (priority === "high") return "border-l-[#f59e0b] bg-[#fffbeb]";
  return "border-l-[#2563eb] bg-white";
}

function categoryLabel(category: OperationalNotification["category"]) {
  const labels: Record<OperationalNotification["category"], string> = {
    missions: "Motor de ventas",
    collections: "Cobranza",
    deliveries: "Entrega",
    fiscal: "Fiscal",
    purchases: "Compras",
    tasks: "Recordatorio",
  };
  return labels[category];
}

export function NotificationBell({ initialSnapshot, compact = false }: NotificationBellProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { ok: boolean; data?: OperationalNotificationSnapshot };
        if (active && payload.ok && payload.data) setSnapshot(payload.data);
      } catch {
        // El encabezado sigue operativo con el ultimo estado conocido.
      }
    }
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const badge = snapshot.pendingCount > 99 ? "99+" : String(snapshot.pendingCount);
  return (
    <details className="group relative" ref={detailsRef}>
      <summary
        aria-label={`Notificaciones: ${snapshot.pendingCount} pendientes`}
        className={cn(
          "relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-[9px] border shadow-[var(--shadow-xs)] transition-colors marker:hidden [&::-webkit-details-marker]:hidden",
          compact
            ? "border-white/25 bg-white/12 text-white hover:bg-white/20"
            : "border-[#d9e2ef] bg-[#f8fafc] text-[#334155] hover:border-[#93b4e7] hover:bg-[#eef5ff] hover:text-[#075ac7]",
        )}
      >
        <span className="sr-only">Abrir centro de notificaciones</span>
        <AppIcon className="h-[19px] w-[19px]" name="bell" />
        {snapshot.pendingCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] rounded-full border-2 border-white bg-[#dc2626] px-1 py-0.5 text-center text-[10px] font-black leading-none text-white">
            {badge}
          </span>
        ) : null}
      </summary>
      <div className="fixed left-3 right-3 top-[4.5rem] z-50 max-h-[min(72vh,620px)] overflow-hidden rounded-2xl border border-[#d9e2ef] bg-white text-[#0f172a] shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.65rem)] sm:w-[430px]">
        <div className="flex items-start justify-between gap-3 border-b border-[#e2e8f0] bg-[linear-gradient(135deg,#f8fbff,#eef5ff)] px-4 py-3.5">
          <div>
            <h2 className="text-sm font-black">Centro de notificaciones</h2>
            <p className="mt-0.5 text-xs font-medium text-[#64748b]">Trabajo que requiere una accion concreta.</p>
          </div>
          <div className={cn("rounded-full px-2.5 py-1 text-xs font-black", snapshot.urgentCount > 0 ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-[#dcfce7] text-[#166534]") }>
            {snapshot.urgentCount > 0 ? `${snapshot.urgentCount} urgentes` : "Al dia"}
          </div>
        </div>
        <div className="max-h-[min(58vh,500px)] overflow-y-auto overscroll-contain p-2">
          {snapshot.items.length > 0 ? snapshot.items.map((item) => (
            <Link
              className={cn("mb-2 block rounded-xl border border-[#e2e8f0] border-l-4 p-3 transition hover:-translate-y-px hover:border-[#93b4e7] hover:shadow-sm", notificationTone(item.priority))}
              href={item.href}
              key={item.id}
              onClick={() => { if (detailsRef.current) detailsRef.current.open = false; }}
            >
              <div className="flex items-start justify-between gap-3">
                <strong className="text-sm leading-snug">{item.title}</strong>
                <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#64748b]">{categoryLabel(item.category)}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{item.detail}</p>
            </Link>
          )) : (
            <div className="grid place-items-center px-6 py-10 text-center">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#dcfce7] text-[#15803d]"><AppIcon name="bell" /></div>
              <strong className="mt-3 text-sm">No hay pendientes importantes</strong>
              <p className="mt-1 text-xs text-[#64748b]">La campana se actualizara cuando aparezca una accion nueva.</p>
            </div>
          )}
        </div>
        <div className="border-t border-[#e2e8f0] px-4 py-2.5 text-center text-[11px] font-medium text-[#64748b]">
          Se actualiza automaticamente cada minuto
        </div>
      </div>
    </details>
  );
}
