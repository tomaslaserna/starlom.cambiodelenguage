"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";

type RegisterCollectionDialogProps = {
  action: (formData: FormData) => Promise<void>;
  customerName: string;
  outstandingAmount: number;
  receiptLabel: string;
  saleId: string;
  today: string;
  triggerClassName?: string;
};

export function RegisterCollectionDialog({
  action,
  customerName,
  outstandingAmount,
  receiptLabel,
  saleId,
  today,
  triggerClassName,
}: RegisterCollectionDialogProps) {
  const [open, setOpen] = useState(false);
  const amountInputId = `dialog-${saleId}-amount`;
  const dateInputId = `dialog-${saleId}-date`;
  const methodSelectId = `dialog-${saleId}-method`;
  const destinationInputId = `dialog-${saleId}-destination`;
  const operationInputId = `dialog-${saleId}-operation`;
  const notesInputId = `dialog-${saleId}-notes`;

  return (
    <>
      <button className={triggerClassName} suppressHydrationWarning onClick={() => setOpen(true)} type="button">
        Registrar pago
      </button>
      {open ? (
        <div
          aria-labelledby={`dialog-${saleId}-title`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
        >
          <button
            aria-label="Cerrar panel de registro"
            className="absolute inset-0 cursor-default bg-black/40"
            suppressHydrationWarning
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="relative z-10 w-full max-w-md rounded-[12px] border border-[color:var(--border)] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="erp-text-title-sm font-black text-[#0f172a]" id={`dialog-${saleId}-title`}>
                  Registrar pago
                </h2>
                <p className="erp-text-caption mt-1 font-medium text-[#64748b]">
                  {receiptLabel} - {customerName || "Sin cliente"}. Se envia a aprobacion de administracion.
                </p>
              </div>
              <button
                aria-label="Cerrar"
                className="shrink-0 rounded-md border border-[color:var(--border)] px-2 py-1 text-xs font-black text-[#64748b] hover:bg-[color:var(--panel-subtle)]"
                suppressHydrationWarning
                onClick={() => setOpen(false)}
                type="button"
              >
                X
              </button>
            </div>
            <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={() => setOpen(false)}>
              <input name="id" type="hidden" value={saleId} />
              <Field htmlFor={amountInputId} label="Monto">
                <Input
                  className="min-h-10 px-2 text-sm"
                  defaultValue={outstandingAmount.toFixed(2)}
                  id={amountInputId}
                  max={outstandingAmount.toFixed(2)}
                  min="0.01"
                  name="amount"
                  required
                  step="0.01"
                  type="number"
                />
              </Field>
              <Field htmlFor={dateInputId} label="Fecha">
                <Input className="min-h-10 px-2 text-sm" defaultValue={today} id={dateInputId} name="date" required type="date" />
              </Field>
              <Field htmlFor={methodSelectId} label="Metodo">
                <Select className="min-h-10 px-2 text-sm" defaultValue="efectivo" id={methodSelectId} name="method">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="echeck">E-check</option>
                </Select>
              </Field>
              <Field htmlFor={destinationInputId} label="Destino">
                <Input
                  className="min-h-10 px-2 text-sm"
                  defaultValue="Caja"
                  id={destinationInputId}
                  name="destination"
                  placeholder="Cuenta o caja"
                  required
                />
              </Field>
              <Field htmlFor={operationInputId} label="Operacion">
                <Input className="min-h-10 px-2 text-sm" id={operationInputId} name="operation" placeholder="Nro. o referencia" />
              </Field>
              <Field htmlFor={notesInputId} label="Notas">
                <Input className="min-h-10 px-2 text-sm" id={notesInputId} name="notes" placeholder="Opcional" />
              </Field>
              <div className="flex items-center justify-end gap-2 sm:col-span-2">
                <Button onClick={() => setOpen(false)} size="sm" type="button" variant="secondary">
                  Cancelar
                </Button>
                <Button size="sm" type="submit">
                  Registrar
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
