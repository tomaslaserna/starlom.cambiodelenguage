"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { NavigationIndicators } from "@/lib/navigation";

const NAVIGATION_INDICATORS_INTERVAL_MS = 20_000;

const NavigationIndicatorsContext = createContext<NavigationIndicators | null>(null);

export function NavigationIndicatorsProvider({
  children,
  initialIndicators,
}: {
  children: ReactNode;
  initialIndicators: NavigationIndicators;
}) {
  const [indicators, setIndicators] = useState(initialIndicators);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      const response = await fetch("/api/navigation/indicators", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: NavigationIndicators };
      if (response.ok && payload.data) setIndicators(payload.data);
    };

    void refresh().catch(() => undefined);
    const interval = window.setInterval(() => {
      if (!navigator.onLine) return;
      void refresh().catch(() => undefined);
    }, NAVIGATION_INDICATORS_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <NavigationIndicatorsContext.Provider value={indicators}>
      {children}
    </NavigationIndicatorsContext.Provider>
  );
}

export function useNavigationIndicators(fallback: NavigationIndicators) {
  return useContext(NavigationIndicatorsContext) ?? fallback;
}
