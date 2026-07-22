"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

const REFRESH_INTERVAL_MS = 4 * 60 * 1000;

type SessionStatus = "active" | "checking" | "expired";

function loginHref() {
  if (typeof window === "undefined") return "/login?expired=1";
  const next = `${window.location.pathname}${window.location.search}`;
  return `/login?expired=1&next=${encodeURIComponent(next)}`;
}

export function SessionKeepAlive() {
  const [status, setStatus] = useState<SessionStatus>("active");
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setStatus("checking");
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      lastCheckRef.current = Date.now();
      setStatus(response.status === 401 ? "expired" : "active");
    } catch {
      // Una falla de red no equivale a cerrar la sesion. Se vuelve a probar al recuperar foco.
      setStatus("active");
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastCheckRef.current >= REFRESH_INTERVAL_MS
      ) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  if (status !== "expired") return null;

  return (
    <aside
      aria-live="assertive"
      className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-[12px] border border-[color:var(--warning)] bg-white p-4 shadow-[var(--shadow-lg)]"
      role="alert"
    >
      <div className="font-extrabold text-[color:var(--foreground)]">La sesion vencio</div>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        La carga queda abierta. Inicia sesion en otra pestana, vuelve aca y comproba el acceso antes de guardar.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          className="inline-flex min-h-9 items-center rounded-[var(--radius-md)] bg-[color:var(--accent)] px-3 text-sm font-bold text-white"
          href={loginHref()}
          rel="noreferrer"
          target="_blank"
        >
          Iniciar sesion
        </Link>
        <Button onClick={() => void refresh()} size="sm" type="button" variant="secondary">
          Comprobar sesion
        </Button>
      </div>
    </aside>
  );
}
