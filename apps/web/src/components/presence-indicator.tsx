"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui";

type OnlineUser = {
  userId: number;
  username: string;
  displayName: string;
  lastSeen: string;
};

export function PresenceIndicator({ compact = false }: { compact?: boolean }) {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function heartbeat() {
      try {
        const response = await fetch("/api/presence", { method: "POST" });
        const payload = await response.json();
        if (!cancelled && payload?.ok) {
          setUsers(payload.data.onlineUsers ?? []);
        }
      } catch {
        if (!cancelled) setUsers([]);
      }
    }

    heartbeat();
    const timer = window.setInterval(heartbeat, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div
      aria-label={`${users.length} usuarios online`}
      aria-live="polite"
      className={cn(
        "erp-text-caption rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 shadow-[var(--shadow-sm)]",
        compact && "px-2",
      )}
      role="status"
      title={`${users.length} usuarios online`}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[color:var(--accent)]" />
        <span className="font-semibold">{users.length}</span>
        {compact ? null : <span className="text-[color:var(--muted)]">online</span>}
      </div>
    </div>
  );
}
