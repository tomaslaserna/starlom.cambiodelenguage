"use client";

import { useState } from "react";
import { Button, Field, Input, TableActionMenu, tableActionItemClass } from "@/components/ui";

type SaleRowActionsProps = {
  editAction: (formData: FormData) => Promise<void>;
  cancelAction: (formData: FormData) => Promise<void>;
  canEdit: boolean;
  sale: {
    id: string;
    receiptLabel: string;
    customerName: string;
    customerDocument: string;
    date: string;
    amount: number;
    seller: string;
    paymentCondition: string;
    receiptNumber: number;
  };
};

export function SaleRowActions({ editAction, cancelAction, canEdit, sale }: SaleRowActionsProps) {
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const idBase = `sale-${sale.id}`;

  return (
    <>
      <TableActionMenu>
        <a
          className={tableActionItemClass}
          href={`/api/pdfs/orders/${sale.id}/request`}
          rel="noreferrer"
          target="_blank"
        >
          Ver PDF
        </a>
        {canEdit ? (
          <>
            <button className={tableActionItemClass} onClick={() => setEditing(true)} type="button">
              Editar
            </button>
            <button
              className={`${tableActionItemClass} text-[color:var(--danger)] hover:bg-[color:var(--danger-subtle)] hover:text-[color:var(--danger)]`}
              onClick={() => setCancelling(true)}
              type="button"
            >
              Cancelar venta
            </button>
          </>
        ) : null}
      </TableActionMenu>

      {canEdit && editing ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <button
            aria-label="Cerrar"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => setEditing(false)}
            type="button"
          />
          <div className="relative z-10 w-full max-w-lg rounded-[12px] border border-[color:var(--border)] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <h2 className="erp-text-title-sm font-black text-[#0f172a]">Editar venta {sale.receiptLabel}</h2>
            <form action={editAction} className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={() => setEditing(false)}>
              <input name="id" type="hidden" value={sale.id} />
              <Field htmlFor={`${idBase}-cliente`} label="Cliente">
                <Input defaultValue={sale.customerName} id={`${idBase}-cliente`} name="nombre_cliente" required />
              </Field>
              <Field htmlFor={`${idBase}-doc`} label="CUIT/DNI">
                <Input defaultValue={sale.customerDocument} id={`${idBase}-doc`} name="dni_cliente" />
              </Field>
              <Field htmlFor={`${idBase}-fecha`} label="Fecha">
                <Input defaultValue={sale.date} id={`${idBase}-fecha`} name="fecha" type="date" />
              </Field>
              <Field htmlFor={`${idBase}-monto`} label="Monto">
                <Input defaultValue={sale.amount.toFixed(2)} id={`${idBase}-monto`} min="0" name="monto" step="0.01" type="number" />
              </Field>
              <Field htmlFor={`${idBase}-comp`} label="Nro. comprobante">
                <Input defaultValue={String(sale.receiptNumber)} id={`${idBase}-comp`} name="nro_comprobante" type="number" />
              </Field>
              <Field htmlFor={`${idBase}-cond`} label="Condicion de pago">
                <Input defaultValue={sale.paymentCondition} id={`${idBase}-cond`} name="condicion_pago" />
              </Field>
              <Field htmlFor={`${idBase}-vend`} label="Vendedor">
                <Input defaultValue={sale.seller} id={`${idBase}-vend`} name="vendedor" />
              </Field>
              <div className="flex items-center justify-end gap-2 sm:col-span-2">
                <Button onClick={() => setEditing(false)} size="sm" type="button" variant="secondary">
                  Cancelar
                </Button>
                <Button size="sm" type="submit">
                  Guardar cambios
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {canEdit && cancelling ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <button
            aria-label="Cerrar"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => setCancelling(false)}
            type="button"
          />
          <div className="relative z-10 w-full max-w-md rounded-[12px] border border-[color:var(--border)] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <h2 className="erp-text-title-sm font-black text-[#0f172a]">Cancelar venta {sale.receiptLabel}</h2>
            <p className="erp-text-caption mt-2 font-medium text-[#64748b]">
              Se va a anular la venta: vuelve el stock al inventario y deja de contar como cobrable. Esta accion no se puede
              deshacer desde aca.
            </p>
            <form action={cancelAction} className="mt-4 flex items-center justify-end gap-2" onSubmit={() => setCancelling(false)}>
              <input name="id" type="hidden" value={sale.id} />
              <Button onClick={() => setCancelling(false)} size="sm" type="button" variant="secondary">
                Volver
              </Button>
              <Button size="sm" type="submit" variant="danger">
                Si, cancelar venta
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
