"use client";

import { cn } from "@/components/ui";

export function PresenceIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-label="Indicador de presencia desactivado"
      className={cn(
        "erp-text-caption rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 shadow-[var(--shadow-sm)]",
        compact && "px-2",
      )}
      role="status"
      title="Presencia desactivada para acelerar pruebas locales"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
        <span className="font-semibold">0</span>
        {compact ? null : <span className="text-[color:var(--muted)]">online</span>}
      </div>
    </div>
  );
}
