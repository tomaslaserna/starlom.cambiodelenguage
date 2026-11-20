"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { updateSupplierAction, type SupplierEditState } from "@/app/suppliers/actions";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { Supplier } from "@/lib/catalog-management";

const initialState: SupplierEditState = { status: "idle", message: "" };

type SupplierDraft = { [Key in keyof Omit<Supplier, "id" | "createdAt">]: string };

function supplierDraftFromSupplier(supplier: Supplier): SupplierDraft {
  return {
    name: supplier.name,
    legalName: supplier.legalName,
    contactName: supplier.contactName,
    taxId: supplier.taxId,
    fiscalCondition: supplier.fiscalCondition,
    rubric: supplier.rubric,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    locality: supplier.locality,
    province: supplier.province,
    notes: supplier.notes,
    paymentTermDays: String(supplier.paymentTermDays),
    deliveryLeadDays: String(supplier.deliveryLeadDays),
    minimumOrderAmount: String(supplier.minimumOrderAmount),
    shippingMethod: supplier.shippingMethod,
    bankName: supplier.bankName,
    bankAccountType: supplier.bankAccountType,
    bankAccountHolder: supplier.bankAccountHolder,
    bankAccountIdentifier: supplier.bankAccountIdentifier,
    bankAlias: supplier.bankAlias,
  };
}

export function SupplierEditDialog({ supplier }: { supplier: Supplier }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => supplierDraftFromSupplier(supplier));
  const [state, formAction, pending] = useActionState(updateSupplierAction, initialState);
  const changeField = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.currentTarget;
    setDraft((current) => ({ ...current, [name]: value }));
  };

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
                  <Field htmlFor="supplier-edit-name" label="Nombre comercial" required><Input id="supplier-edit-name" name="name" onChange={changeField} required value={draft.name} /></Field>
                  <Field htmlFor="supplier-edit-legal" label="Razón social"><Input id="supplier-edit-legal" name="legalName" onChange={changeField} value={draft.legalName} /></Field>
                  <Field htmlFor="supplier-edit-tax" label="CUIT"><Input id="supplier-edit-tax" inputMode="numeric" name="taxId" onChange={changeField} value={draft.taxId} /></Field>
                  <Field htmlFor="supplier-edit-fiscal" label="Condición fiscal"><Input id="supplier-edit-fiscal" name="fiscalCondition" onChange={changeField} value={draft.fiscalCondition} /></Field>
                  <Field htmlFor="supplier-edit-rubric" label="Rubro"><Input id="supplier-edit-rubric" name="rubric" onChange={changeField} value={draft.rubric} /></Field>
                </EditorSection>

                <EditorSection title="Contacto y ubicación">
                  <Field htmlFor="supplier-edit-contact" label="Contacto principal"><Input id="supplier-edit-contact" name="contactName" onChange={changeField} value={draft.contactName} /></Field>
                  <Field htmlFor="supplier-edit-phone" label="Teléfono"><Input id="supplier-edit-phone" name="phone" onChange={changeField} value={draft.phone} /></Field>
                  <Field htmlFor="supplier-edit-email" label="Email"><Input id="supplier-edit-email" name="email" onChange={changeField} type="email" value={draft.email} /></Field>
                  <Field htmlFor="supplier-edit-address" label="Dirección"><Input id="supplier-edit-address" name="address" onChange={changeField} value={draft.address} /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field htmlFor="supplier-edit-locality" label="Localidad"><Input id="supplier-edit-locality" name="locality" onChange={changeField} value={draft.locality} /></Field>
                    <Field htmlFor="supplier-edit-province" label="Provincia"><Input id="supplier-edit-province" name="province" onChange={changeField} value={draft.province} /></Field>
                  </div>
                </EditorSection>

                <EditorSection title="Condiciones y logística">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field htmlFor="supplier-edit-payment" label="Plazo de pago"><Input id="supplier-edit-payment" max="3650" min="0" name="paymentTermDays" onChange={changeField} step="1" type="number" value={draft.paymentTermDays} /></Field>
                    <Field htmlFor="supplier-edit-delivery" label="Plazo de entrega"><Input id="supplier-edit-delivery" max="3650" min="0" name="deliveryLeadDays" onChange={changeField} step="1" type="number" value={draft.deliveryLeadDays} /></Field>
                  </div>
                  <Field htmlFor="supplier-edit-minimum" label="Compra mínima"><Input id="supplier-edit-minimum" min="0" name="minimumOrderAmount" onChange={changeField} step="0.01" type="number" value={draft.minimumOrderAmount} /></Field>
                  <Field htmlFor="supplier-edit-shipping" label="Forma de envío"><Input id="supplier-edit-shipping" name="shippingMethod" onChange={changeField} value={draft.shippingMethod} /></Field>
                  <Field htmlFor="supplier-edit-notes" label="Notas"><Textarea id="supplier-edit-notes" name="notes" onChange={changeField} rows={4} value={draft.notes} /></Field>
                </EditorSection>

                <EditorSection title="Cuenta bancaria">
                  <Field htmlFor="supplier-edit-bank" label="Banco"><Input id="supplier-edit-bank" name="bankName" onChange={changeField} value={draft.bankName} /></Field>
                  <Field htmlFor="supplier-edit-account-type" label="Tipo de cuenta"><Input id="supplier-edit-account-type" name="bankAccountType" onChange={changeField} value={draft.bankAccountType} /></Field>
                  <Field htmlFor="supplier-edit-holder" label="Titular"><Input id="supplier-edit-holder" name="bankAccountHolder" onChange={changeField} value={draft.bankAccountHolder} /></Field>
                  <Field htmlFor="supplier-edit-identifier" label="CBU/CVU"><Input id="supplier-edit-identifier" inputMode="numeric" name="bankAccountIdentifier" onChange={changeField} value={draft.bankAccountIdentifier} /></Field>
                  <Field htmlFor="supplier-edit-alias" label="Alias"><Input id="supplier-edit-alias" name="bankAlias" onChange={changeField} value={draft.bankAlias} /></Field>
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
