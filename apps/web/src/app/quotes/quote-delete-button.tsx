"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type QuoteDeleteButtonProps = {
  quoteId: string;
  quoteNumber: string;
  action: (formData: FormData) => Promise<void>;
};

export function QuoteDeleteButton({ quoteId, quoteNumber, action }: QuoteDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="w-full justify-center text-center" onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">
        Eliminar
      </Button>
      {open ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <button aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/40" onClick={() => setOpen(false)} type="button" />
          <div className="relative z-10 w-full max-w-md rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <h2 className="erp-text-title-sm font-black">Eliminar presupuesto</h2>
            <p className="erp-text-body-sm mt-3">
              ¿Eliminar el presupuesto <strong>{quoteNumber}</strong>? Esta acción no se puede deshacer.
            </p>
            <form action={action} className="mt-4 flex justify-end gap-2" onSubmit={() => setOpen(false)}>
              <input name="id" type="hidden" value={quoteId} />
              <Button onClick={() => setOpen(false)} size="sm" type="button" variant="secondary">Cancelar</Button>
              <Button size="sm" type="submit">Eliminar</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
