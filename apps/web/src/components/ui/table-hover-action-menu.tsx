"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TableHoverActionMenuProps = {
  children: ReactNode;
  label: string;
  width?: number;
};

const VIEWPORT_GAP = 12;

export function TableHoverActionMenu({ children, label, width = 250 }: TableHoverActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const show = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      const focusedElement = document.activeElement;
      if (focusedElement && menuRef.current?.contains(focusedElement)) return;
      setOpen(false);
    }, 140);
  }, [cancelClose]);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 0;
    const left = Math.max(VIEWPORT_GAP, Math.min(buttonRect.right - width, window.innerWidth - width - VIEWPORT_GAP));
    const opensUpward = menuHeight > 0 && buttonRect.bottom + menuHeight + VIEWPORT_GAP > window.innerHeight;
    const top = opensUpward
      ? Math.max(VIEWPORT_GAP, buttonRect.top - menuHeight - 6)
      : buttonRect.bottom + 6;

    setPosition({ left, top, visible: true });
  }, [width]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        className="flex h-[var(--control-height-sm)] w-[var(--control-height-sm)] items-center justify-center rounded-[9px] border border-[#b8cdf1] bg-white text-lg font-bold leading-none tracking-[2px] text-[#1755b8] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#8fb1e8] hover:bg-[#f5f8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1755b8]"
        onBlur={scheduleClose}
        onClick={show}
        onFocus={show}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        ref={buttonRef}
        type="button"
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open ? createPortal(
        <div
          className="fixed z-[100] grid max-h-[calc(100vh-24px)] gap-0.5 overflow-y-auto rounded-[10px] border border-[#b8cdf1] bg-[#fbfdff] p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.2)]"
          onBlur={scheduleClose}
          onFocus={show}
          onMouseEnter={show}
          onMouseLeave={scheduleClose}
          ref={menuRef}
          style={{ left: position.left, top: position.top, visibility: position.visible ? "visible" : "hidden", width }}
        >
          {children}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
