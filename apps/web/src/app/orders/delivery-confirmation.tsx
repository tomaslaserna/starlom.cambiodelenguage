"use client";

import { useState } from "react";
import { updateOrderStatusAction } from "@/app/orders/actions";
import { Button, tableActionItemClass } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";

type DeliveryConfirmationProps = {
  id: string;
  orderLabel: string;
  operator: string;
  customer: string;
  documentLabel: string;
  issuesInvoice: boolean;
  amount: number;
  estimatedDate: string | null;
  priority: string;
  itemCount: number;
};

export function DeliveryConfirmation({
  id,
  orderLabel,
  operator,
  customer,
  documentLabel,
  issuesInvoice,
  amount,
  estimatedDate,
  priority,
  itemCount,
}: DeliveryConfirmationProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label={`Marcar entregado el pedido ${orderLabel}`}
        className={tableActionItemClass}
        type="button"
        onClick={() => setOpen(true)}
      >
        Entregado
      </button>

      {open ? (
        <div
          aria-labelledby={`delivery-title-${id}`}
          aria-modal="true"
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl border border-[color:var(--border)] bg-white p-5 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-[#2563eb]">Confirmar entrega</p>
                <h2 className="mt-1 text-xl font-black" id={`delivery-title-${id}`}>Pedido #{orderLabel}</h2>
                <p className="mt-1 text-sm text-[color:var(--muted)]">Revisá el resumen antes de afectar stock, cuenta corriente y facturación.</p>
              </div>
              <button aria-label="Cerrar confirmación" className="rounded-lg px-3 py-2 text-xl text-[color:var(--muted)] hover:bg-slate-100" type="button" onClick={() => setOpen(false)}>×</button>
            </div>

            <dl className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold text-[color:var(--muted)]">Operador</dt><dd className="font-bold">{operator}</dd></div>
              <div><dt className="text-xs font-semibold text-[color:var(--muted)]">Cliente</dt><dd className="font-bold">{customer}</dd></div>
              <div><dt className="text-xs font-semibold text-[color:var(--muted)]">Comprobante</dt><dd className="font-bold">{documentLabel}</dd></div>
              <div><dt className="text-xs font-semibold text-[color:var(--muted)]">Factura automática</dt><dd className={issuesInvoice ? "font-bold text-emerald-700" : "font-bold"}>{issuesInvoice ? "Sí, al confirmar" : "No"}</dd></div>
              <div><dt className="text-xs font-semibold text-[color:var(--muted)]">Monto</dt><dd className="font-mono text-base font-black">{formatCurrency(amount)}</dd></div>
              <div><dt className="text-xs font-semibold text-[color:var(--muted)]">Productos</dt><dd className="font-bold">{itemCount}</dd></div>
              <div><dt className="text-xs font-semibold text-[color:var(--muted)]">Entrega estimada</dt><dd className="font-bold">{estimatedDate ? formatDate(estimatedDate) : "-"}</dd></div>
              <div><dt className="text-xs font-semibold text-[color:var(--muted)]">Urgencia</dt><dd className="font-bold capitalize">{priority}</dd></div>
            </dl>

            <form action={updateOrderStatusAction} className="mt-5 flex justify-end gap-3">
              <input name="id" type="hidden" value={id} />
              <input name="status" type="hidden" value="entregado" />
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Volver</Button>
              <Button type="submit">Confirmar entrega</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
