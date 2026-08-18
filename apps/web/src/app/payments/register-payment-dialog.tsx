"use client";

import { useId, useState } from "react";
import { Button, Field, Input, SearchableSelect, Select } from "@/components/ui";
import {
  COLLECTION_METHODS,
  SUGGESTED_DESTINATIONS,
  collectionMethodRequiresOperation,
  suggestedCollectionDestination,
} from "@/lib/collection-methods";

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  echeck: "E-check",
};

export type PaymentCustomerOption = { id: string; name: string };

type RegisterPaymentDialogProps = {
  action: (formData: FormData) => Promise<void>;
  customers: PaymentCustomerOption[];
  defaultCustomerId?: string;
  today: string;
  triggerLabel?: string;
  triggerClassName?: string;
};

export function RegisterPaymentDialog({
  action,
  customers,
  defaultCustomerId,
  today,
  triggerLabel = "+ Nuevo pago",
  triggerClassName,
}: RegisterPaymentDialogProps) {
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(defaultCustomerId ?? "");
  const [method, setMethod] = useState<string>(COLLECTION_METHODS[0]);
  const [destination, setDestination] = useState(() => suggestedCollectionDestination(COLLECTION_METHODS[0]));
  const operationRequired = collectionMethodRequiresOperation(method);
  const hideCustomerSelector = Boolean(defaultCustomerId);

  const customerOptions = customers.map((customer) => ({ value: customer.id, label: customer.name }));

  function handleMethodChange(nextMethod: string) {
    setMethod(nextMethod);
    // Solo cambiamos el destino sugerido si el usuario no lo editó a mano.
    setDestination((current) =>
      SUGGESTED_DESTINATIONS.includes(current) ? suggestedCollectionDestination(nextMethod) : current,
    );
  }

  function resetForm() {
    setClientId(defaultCustomerId ?? "");
    setMethod(COLLECTION_METHODS[0]);
    setDestination(suggestedCollectionDestination(COLLECTION_METHODS[0]));
  }

  const customerSelectId = `${dialogId}-customer`;
  const amountInputId = `${dialogId}-amount`;
  const dateInputId = `${dialogId}-date`;
  const methodSelectId = `${dialogId}-method`;
  const destinationInputId = `${dialogId}-destination`;
  const operationInputId = `${dialogId}-operation`;
  const notesInputId = `${dialogId}-notes`;

  return (
    <>
      <Button className={triggerClassName} onClick={() => setOpen(true)} size="sm" type="button">
        {triggerLabel}
      </Button>
      {open ? (
        <div
          aria-labelledby={`${dialogId}-title`}
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
                <h2 className="erp-text-title-sm font-black text-[#0f172a]" id={`${dialogId}-title`}>
                  Registrar pago
                </h2>
                <p className="erp-text-caption mt-1 font-medium text-[#64748b]">
                  Se envia a aprobacion de administracion si no tenes permiso de aprobar.
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
            <form
              action={action}
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={() => {
                setOpen(false);
                resetForm();
              }}
            >
              {hideCustomerSelector ? (
                <input name="clientId" type="hidden" value={defaultCustomerId} />
              ) : (
                <Field className="sm:col-span-2" htmlFor={customerSelectId} label="Cliente" required>
                  <SearchableSelect
                    id={customerSelectId}
                    name="clientId"
                    onChange={setClientId}
                    options={customerOptions}
                    placeholder="Buscar cliente"
                    required
                    value={clientId}
                  />
                </Field>
              )}
              <Field htmlFor={amountInputId} label="Monto">
                <Input
                  className="min-h-10 px-2 text-sm"
                  id={amountInputId}
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
                <Select
                  className="min-h-10 px-2 text-sm"
                  id={methodSelectId}
                  name="method"
                  onChange={(event) => handleMethodChange(event.target.value)}
                  value={method}
                >
                  {COLLECTION_METHODS.map((methodOption) => (
                    <option key={methodOption} value={methodOption}>
                      {METHOD_LABELS[methodOption] ?? methodOption}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor={destinationInputId} label="Destino">
                <Input
                  className="min-h-10 px-2 text-sm"
                  id={destinationInputId}
                  name="destination"
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="Cuenta o caja"
                  required
                  value={destination}
                />
              </Field>
              <Field htmlFor={operationInputId} label="Operacion" required={operationRequired}>
                <Input
                  className="min-h-10 px-2 text-sm"
                  id={operationInputId}
                  name="operation"
                  placeholder={operationRequired ? "Nro. o referencia (obligatorio)" : "Nro. o referencia"}
                  required={operationRequired}
                />
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
