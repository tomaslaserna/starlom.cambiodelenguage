"use client";

import { useEffect, useId, useMemo, useState } from "react";
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
type OpenRemittance = { saleId: string; number: string; date: string; total: number; outstanding: number };

const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

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
  const [remittances, setRemittances] = useState<OpenRemittance[]>([]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [loadingRemittances, setLoadingRemittances] = useState(false);
  const [remittanceError, setRemittanceError] = useState("");
  const operationRequired = collectionMethodRequiresOperation(method);
  const hideCustomerSelector = Boolean(defaultCustomerId);

  const customerOptions = customers.map((customer) => ({ value: customer.id, label: customer.name }));
  const allocations = useMemo(
    () => remittances
      .filter((sale) => Object.hasOwn(allocationAmounts, sale.saleId))
      .map((sale) => ({ saleId: sale.saleId, amount: Math.round(Number(allocationAmounts[sale.saleId] || 0) * 100) / 100 }))
      .filter((item) => item.amount > 0),
    [allocationAmounts, remittances],
  );
  const allocatedTotal = Math.round(allocations.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const paymentAmount = paymentAmountInput === ""
    ? allocatedTotal
    : Math.round(Number(paymentAmountInput || 0) * 100) / 100;
  const creditBalance = Math.max(0, Math.round((paymentAmount - allocatedTotal) * 100) / 100);

  useEffect(() => {
    if (!open || !clientId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoadingRemittances(true);
      setRemittanceError("");
      setRemittances([]);
      setAllocationAmounts({});
    });
    fetch(`/api/payments/open-remittances?clientId=${encodeURIComponent(clientId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: OpenRemittance[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "No se pudieron cargar los remitos pendientes");
        setRemittances(payload.data ?? []);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setRemittanceError(error instanceof Error ? error.message : "No se pudieron cargar los remitos");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRemittances(false);
      });
    return () => controller.abort();
  }, [clientId, open]);

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
    setRemittances([]);
    setAllocationAmounts({});
    setPaymentAmountInput("");
  }

  function toggleRemittance(sale: OpenRemittance) {
    setAllocationAmounts((current) => {
      if (Object.hasOwn(current, sale.saleId)) {
        const next = { ...current };
        delete next[sale.saleId];
        return next;
      }
      return { ...current, [sale.saleId]: sale.outstanding.toFixed(2) };
    });
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
          <div className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[12px] border border-[color:var(--border)] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
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
              <input name="allocations" type="hidden" value={JSON.stringify(allocations)} />
              <Field className="sm:col-span-2" htmlFor={amountInputId} label="Importe recibido" required>
                <Input
                  id={amountInputId}
                  min="0.01"
                  name="amount"
                  onChange={(event) => setPaymentAmountInput(event.target.value)}
                  step="0.01"
                  type="number"
                  value={paymentAmountInput === "" ? (allocatedTotal || "") : paymentAmountInput}
                />
              </Field>
              <div className="sm:col-span-2">
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[#0f172a]">Aplicar a remitos pendientes</p>
                    <p className="mt-0.5 text-xs font-medium text-[#64748b]">Elegí uno o varios. Podés abonar el total o escribir un importe parcial.</p>
                  </div>
                  <div className="text-right">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-[#64748b]">Aplicado a remitos</span>
                    <strong className="text-lg font-black text-[#075ac7]">{currency.format(allocatedTotal)}</strong>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-[color:var(--border)]">
                  {!clientId ? <p className="p-4 text-sm text-[#64748b]">Primero seleccioná un cliente.</p> : null}
                  {loadingRemittances ? <p className="p-4 text-sm font-semibold text-[#64748b]">Buscando remitos pendientes…</p> : null}
                  {remittanceError ? <p className="p-4 text-sm font-semibold text-red-600">{remittanceError}</p> : null}
                  {!loadingRemittances && !remittanceError && clientId && remittances.length === 0 ? (
                    <p className="p-4 text-sm font-semibold text-emerald-700">Este cliente no tiene remitos pendientes para imputar.</p>
                  ) : null}
                  {remittances.map((sale) => {
                    const selected = Object.hasOwn(allocationAmounts, sale.saleId);
                    return (
                      <div className="grid gap-2 border-b border-[color:var(--border)] p-3 last:border-b-0 sm:grid-cols-[auto_1fr_150px] sm:items-center" key={sale.saleId}>
                        <input
                          aria-label={`Seleccionar ${sale.number}`}
                          checked={selected}
                          className="size-5 accent-[#075ac7]"
                          onChange={() => toggleRemittance(sale)}
                          type="checkbox"
                        />
                        <button className="text-left" onClick={() => toggleRemittance(sale)} type="button">
                          <span className="block text-sm font-black text-[#0f172a]">{sale.number || "Remito"}</span>
                          <span className="text-xs text-[#64748b]">{sale.date} · Total {currency.format(sale.total)} · Pendiente <b className="text-red-600">{currency.format(sale.outstanding)}</b></span>
                        </button>
                        <Input
                          aria-label={`Importe aplicado a ${sale.number}`}
                          className="min-h-10 px-2 text-right text-sm font-bold"
                          disabled={!selected}
                          max={sale.outstanding}
                          min="0.01"
                          onChange={(event) => setAllocationAmounts((current) => ({ ...current, [sale.saleId]: event.target.value }))}
                          step="0.01"
                          type="number"
                          value={selected ? allocationAmounts[sale.saleId] : ""}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              {creditBalance > 0 ? (
                <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
                  <strong>Saldo a favor: {currency.format(creditBalance)}</strong>
                  <p className="mt-1 text-xs font-medium">El excedente quedará disponible en la cuenta corriente del cliente.</p>
                </div>
              ) : null}
              {paymentAmount > 0 && allocatedTotal - paymentAmount > 0.005 ? (
                <p className="sm:col-span-2 text-sm font-bold text-red-600" role="alert">El importe recibido no alcanza para cubrir lo aplicado a los remitos.</p>
              ) : null}
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
                <Button disabled={paymentAmount <= 0 || allocations.length === 0 || allocatedTotal - paymentAmount > 0.005 || loadingRemittances} size="sm" type="submit">
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
