"use client";

import { useEffect, useRef } from "react";

type VisibilityAwarePollingOptions = {
  enabled?: boolean;
  intervalMs: number;
  runImmediately?: boolean;
  slowAfterMs?: number;
  slowIntervalMs?: number;
};

export function useVisibilityAwarePolling(
  callback: () => void | Promise<void>,
  {
    enabled = true,
    intervalMs,
    runImmediately = true,
    slowAfterMs,
    slowIntervalMs,
  }: VisibilityAwarePollingOptions,
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let running = false;
    let timer: number | null = null;
    const startedAt = Date.now();

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const nextDelay = () =>
      slowAfterMs !== undefined &&
      slowIntervalMs !== undefined &&
      Date.now() - startedAt >= slowAfterMs
        ? slowIntervalMs
        : intervalMs;

    const schedule = () => {
      clearTimer();
      if (!active || document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => void run(), nextDelay());
    };

    const run = async () => {
      if (!active || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        await callbackRef.current();
      } finally {
        running = false;
        schedule();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearTimer();
        void run();
      } else {
        clearTimer();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (runImmediately) void run();
    else schedule();

    return () => {
      active = false;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, runImmediately, slowAfterMs, slowIntervalMs]);
}
