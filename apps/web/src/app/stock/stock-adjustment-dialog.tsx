"use client";

import { useEffect, useRef } from "react";
import { StockMovementForm } from "@/app/stock/stock-movement-form";
import type { InventoryProduct } from "@/lib/inventory";

type StockAdjustmentDialogProps = {
  action: (formData: FormData) => void | Promise<void>;
  idempotencyKey: string;
  onClose: () => void;
  open: boolean;
  product: InventoryProduct;
};

export function StockAdjustmentDialog({
  action,
  idempotencyKey,
  onClose,
  open,
  product,
}: StockAdjustmentDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const quantityInput = dialog?.querySelector<HTMLInputElement>("[data-stock-quantity]");
    if (quantityInput) quantityInput.select();
    else dialog?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  const titleId = `stock-adjustment-${product.id}-title`;

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
      role="dialog"
    >
      <button
        aria-label="Cerrar modificación de stock"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[1px]"
        onClick={onClose}
        type="button"
      />
      <div
        className="relative z-10 max-h-[calc(100vh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[14px] border border-[color:var(--border)] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.3)] sm:max-h-[calc(100vh-2.5rem)]"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[color:var(--border)] bg-white px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-lg font-extrabold text-[#0f172a]" id={titleId}>Modificar stock</h2>
            <p className="mt-1 text-sm font-medium text-[color:var(--muted)]">
              El movimiento queda registrado en el historial con tu usuario.
            </p>
          </div>
          <button
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] text-lg font-medium text-[color:var(--muted)] transition-colors hover:bg-[color:var(--panel-subtle)]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="p-4 sm:p-5">
          <StockMovementForm
            action={action}
            idempotencyKey={idempotencyKey}
            onCancel={onClose}
            product={product}
          />
        </div>
      </div>
    </div>
  );
}
