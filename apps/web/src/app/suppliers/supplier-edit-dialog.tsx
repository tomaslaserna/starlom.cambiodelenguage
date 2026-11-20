"use client";

import { useActionState, useState } from "react";
import { updateSupplierAction, type SupplierEditState } from "@/app/suppliers/actions";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { Supplier } from "@/lib/catalog-management";

const initialState: SupplierEditState = { status: "idle", message: "" };

export function SupplierEditDialog({ supplier }: { supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateSupplierAction, initialState);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">Editar</Button>
      {open ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5" role="dialog">
          <button aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/40" onClick={() => setOpen(false)} type="button" />
          <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] shadow-2xl">
            <div className="flex items-start justify-between border-b border-[color:var(--border)] px-5 py-4">
              <div>
                <h2 className="erp-text-title-sm font-black">Editar proveedor</h2>
                <p className="mt-1 erp-text-caption text-[color:var(--muted)]">Actualizá identidad, contacto, condiciones, logística y cuenta bancaria.</p>
              </div>
              <button aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full border border-[color:var(--border)] text-xl text-[color:var(--muted)] hover:bg-[color:var(--background)]" onClick={() => setOpen(false)} type="button">×</button>
            </div>
            <form action={formAction} className="flex max-h-[calc(100dvh-5rem)] flex-col">
              <input name="id" type="hidden" value={supplier.id} />
              <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-4 lg:grid-cols-2 xl:grid-cols-4">
                <EditorSection title="Identidad y fiscal">
                  <Field htmlFor="supplier-edit-name" label="Nombre comercial" required><Input defaultValue={supplier.name} id="supplier-edit-name" name="name" required /></Field>
                  <Field htmlFor="supplier-edit-legal" label="Razón social"><Input defaultValue={supplier.legalName} id="supplier-edit-legal" name="legalName" /></Field>
                  <Field htmlFor="supplier-edit-tax" label="CUIT"><Input defaultValue={supplier.taxId} id="supplier-edit-tax" inputMode="numeric" name="taxId" /></Field>
                  <Field htmlFor="supplier-edit-fiscal" label="Condición fiscal"><Input defaultValue={supplier.fiscalCondition} id="supplier-edit-fiscal" name="fiscalCondition" /></Field>
                  <Field htmlFor="supplier-edit-rubric" label="Rubro"><Input defaultValue={supplier.rubric} id="supplier-edit-rubric" name="rubric" /></Field>
                </EditorSection>

                <EditorSection title="Contacto y ubicación">
                  <Field htmlFor="supplier-edit-contact" label="Contacto principal"><Input defaultValue={supplier.contactName} id="supplier-edit-contact" name="contactName" /></Field>
                  <Field htmlFor="supplier-edit-phone" label="Teléfono"><Input defaultValue={supplier.phone} id="supplier-edit-phone" name="phone" /></Field>
                  <Field htmlFor="supplier-edit-email" label="Email"><Input defaultValue={supplier.email} id="supplier-edit-email" name="email" type="email" /></Field>
                  <Field htmlFor="supplier-edit-address" label="Dirección"><Input defaultValue={supplier.address} id="supplier-edit-address" name="address" /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field htmlFor="supplier-edit-locality" label="Localidad"><Input defaultValue={supplier.locality} id="supplier-edit-locality" name="locality" /></Field>
                    <Field htmlFor="supplier-edit-province" label="Provincia"><Input defaultValue={supplier.province} id="supplier-edit-province" name="province" /></Field>
                  </div>
                </EditorSection>

                <EditorSection title="Condiciones y logística">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field htmlFor="supplier-edit-payment" label="Plazo de pago"><Input defaultValue={supplier.paymentTermDays} id="supplier-edit-payment" max="3650" min="0" name="paymentTermDays" step="1" type="number" /></Field>
                    <Field htmlFor="supplier-edit-delivery" label="Plazo de entrega"><Input defaultValue={supplier.deliveryLeadDays} id="supplier-edit-delivery" max="3650" min="0" name="deliveryLeadDays" step="1" type="number" /></Field>
                  </div>
                  <Field htmlFor="supplier-edit-minimum" label="Compra mínima"><Input defaultValue={supplier.minimumOrderAmount} id="supplier-edit-minimum" min="0" name="minimumOrderAmount" step="0.01" type="number" /></Field>
                  <Field htmlFor="supplier-edit-shipping" label="Forma de envío"><Input defaultValue={supplier.shippingMethod} id="supplier-edit-shipping" name="shippingMethod" /></Field>
                  <Field htmlFor="supplier-edit-notes" label="Notas"><Textarea defaultValue={supplier.notes} id="supplier-edit-notes" name="notes" rows={4} /></Field>
                </EditorSection>

                <EditorSection title="Cuenta bancaria">
                  <Field htmlFor="supplier-edit-bank" label="Banco"><Input defaultValue={supplier.bankName} id="supplier-edit-bank" name="bankName" /></Field>
                  <Field htmlFor="supplier-edit-account-type" label="Tipo de cuenta"><Input defaultValue={supplier.bankAccountType} id="supplier-edit-account-type" name="bankAccountType" /></Field>
                  <Field htmlFor="supplier-edit-holder" label="Titular"><Input defaultValue={supplier.bankAccountHolder} id="supplier-edit-holder" name="bankAccountHolder" /></Field>
                  <Field htmlFor="supplier-edit-identifier" label="CBU/CVU"><Input defaultValue={supplier.bankAccountIdentifier} id="supplier-edit-identifier" inputMode="numeric" name="bankAccountIdentifier" /></Field>
                  <Field htmlFor="supplier-edit-alias" label="Alias"><Input defaultValue={supplier.bankAlias} id="supplier-edit-alias" name="bankAlias" /></Field>
                </EditorSection>
              </div>
              {state.status === "error" ? <p className="mx-5 mb-3 rounded-xl border border-[color:var(--danger)]/30 bg-[color:var(--danger-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--danger)]">{state.message}</p> : null}
              <div className="flex justify-end gap-2 border-t border-[color:var(--border)] bg-[color:var(--panel)] px-5 py-3">
                <Button disabled={pending} onClick={() => setOpen(false)} size="sm" type="button" variant="secondary">Cancelar</Button>
                <Button disabled={pending} size="sm" type="submit">{pending ? "Guardando…" : "Guardar cambios"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function EditorSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="grid content-start gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4"><h3 className="erp-text-body-sm font-black text-[color:var(--accent)]">{title}</h3>{children}</section>;
}
