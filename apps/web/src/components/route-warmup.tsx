"use client";

import { useEffect } from "react";

const WARMUP_ROUTES = [
  "/metrics",
  "/balance",
  "/treasury",
  "/orders",
  "/sales",
  "/products",
  "/customers",
  "/database",
];

export function RouteWarmup() {
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function warmup() {
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));

      for (const route of WARMUP_ROUTES) {
        if (cancelled) return;
        try {
          await fetch(route, {
            credentials: "same-origin",
            priority: "low",
            signal: controller.signal,
          });
        } catch {
          // Warmup must never affect the user's session.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }

    warmup();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return null;
}
