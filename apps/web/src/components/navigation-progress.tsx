"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAVIGATION_TIMEOUT_MS = 15_000;

function isInternalNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download")
  ) {
    return false;
  }

  const target = new URL(anchor.href, window.location.href);
  const current = new URL(window.location.href);

  return (
    target.origin === current.origin &&
    `${target.pathname}${target.search}` !== `${current.pathname}${current.search}`
  );
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocation = `${pathname}?${searchParams.toString()}`;
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = pendingFrom === currentLocation;

  useEffect(() => {
    function beginNavigation() {
      setPendingFrom(currentLocation);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setPendingFrom(null), NAVIGATION_TIMEOUT_MS);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (anchor instanceof HTMLAnchorElement && isInternalNavigation(event, anchor)) {
        beginNavigation();
      }
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", beginNavigation);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", beginNavigation);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentLocation]);

  if (!pending) return null;

  return (
    <div
      aria-label="Cargando pagina"
      aria-valuemax={100}
      aria-valuemin={0}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-[#bfdbfe]"
      role="progressbar"
    >
      <span className="erp-navigation-progress block h-full w-2/5 bg-[#2563eb] shadow-[0_0_10px_rgba(37,99,235,0.65)]" />
    </div>
  );
}
