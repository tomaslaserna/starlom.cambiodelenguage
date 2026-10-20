"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Field, Input, MoneyInput, SearchableSelect, Select } from "@/components/ui";
import { COLLECTION_METHODS, collectionMethodRequiresOperation } from "@/lib/collection-methods";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/components/ui/utils";
import { applyCustomerCreditAction } from "./actions";
import type { CustomerAvailableCredit, CustomerAccountReconciliation } from "@/lib/customer-accounts";

const METHODS = [
  { value: "transferencia", label: "Transferencia", hint: "Banco o billetera" },
  { value: "efectivo", label: "Efectivo", hint: "Ingreso a caja" },
  { value: "echeck", label: "E-cheq", hint: "Cartera de cheques" },
];
const round = (value: number) => Math.round(value * 100) / 100;
export type PaymentCustomerOption = { id: string; name: string };
export type PaymentTreasuryAccountOption = { id: string; name: string; accountType: "cash" | "bank" | "wallet" | "other" };
type OpenRemittance = { saleId: string; number: string; date: string; total: number; outstanding: number };
type Props = {
  action: (formData: FormData) => Promise<void>;
  customers: PaymentCustomerOption[]; treasuryAccounts: PaymentTreasuryAccountOption[];
  defaultCustomerId?: string; today: string; triggerLabel?: string; triggerClassName?: string;
};

export function RegisterPaymentDialog({ action, customers, treasuryAccounts, defaultCustomerId, today, triggerLabel = "+ Nuevo pago", triggerClassName }: Props) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(defaultCustomerId ?? "");
  const [method, setMethod] = useState<string>(COLLECTION_METHODS[0]);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(() => treasuryAccounts.find((a) => a.accountType === "cash")?.id ?? "");
  const [remittances, setRemittances] = useState<OpenRemittance[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [credits, setCredits] = useState<CustomerAvailableCredit[]>([]);
  const [reconciliation, setReconciliation] = useState<CustomerAccountReconciliation | null>(null);
  const [canApplyCredit, setCanApplyCredit] = useState(false);
  const [mode, setMode] = useState<"payment" | "credit">("payment");
  const [sourceId, setSourceId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const creditMode = mode === "credit";
  const source = credits.find((c) => c.sourceId === sourceId);
  const eligibleAccounts = treasuryAccounts.filter((a) => method === "efectivo" ? a.accountType === "cash" : ["bank", "wallet"].includes(a.accountType));
  const selected = remittances.filter((s) => Object.hasOwn(amounts, s.saleId));
  const allocations = selected.map((s) => ({ saleId: s.saleId, amount: round(Number(amounts[s.saleId])) }));
  const applied = round(allocations.reduce((sum, a) => sum + (Number.isFinite(a.amount) ? a.amount : 0), 0));
  const received = round(Number(amount) || 0);
  const available = creditMode ? source?.amount ?? 0 : received;
  const remaining = round(Math.max(0, available - applied));
  const rowInvalid = selected.some((s) => !Number.isFinite(Number(amounts[s.saleId])) || Number(amounts[s.saleId]) <= 0 || round(Number(amounts[s.saleId])) - s.outstanding > 0.005);
  const invalid = !clientId || loading || Boolean(loadError) || rowInvalid || applied - available > 0.005
    || (creditMode ? !source || applied <= 0 || !canApplyCredit : received <= 0 || (method !== "echeck" && !accountId));

  useEffect(() => {
    if (!open || !clientId) return;
    const controller = new AbortController();
    fetch(`/api/payments/open-remittances?clientId=${encodeURIComponent(clientId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { data?: OpenRemittance[]; credits?: CustomerAvailableCredit[]; reconciliation?: CustomerAccountReconciliation; canApplyCredit?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error || "No se pudieron cargar los remitos pendientes");
        if (controller.signal.aborted) return;
        setRemittances(payload.data ?? []); setCredits(payload.credits ?? []);
        setReconciliation(payload.reconciliation ?? null);
        setCanApplyCredit(Boolean(payload.canApplyCredit));
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "No se pudieron cargar los remitos"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, clientId]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; panel.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);

  function clearSelection(nextClientId: string) {
    setClientId(nextClientId); setRemittances([]); setAmounts({}); setCredits([]); setReconciliation(null);
    setMode("payment"); setSourceId(""); setCanApplyCredit(false); setLoadError(""); setError("");
    setAmount(""); setLoading(Boolean(nextClientId)); setRequestId(crypto.randomUUID());
  }
  function close() { if (!submitting.current) setOpen(false); }
  function toggle(sale: OpenRemittance) {
    setAmounts((current) => {
      const next = { ...current };
      if (Object.hasOwn(next, sale.saleId)) delete next[sale.saleId];
      else next[sale.saleId] = sale.outstanding.toFixed(2);
      return next;
    });
  }
  async function submit(formData: FormData) {
    if (invalid || submitting.current) return;
    submitting.current = true; setPending(true); setError("");
    try {
      if (creditMode) await applyCustomerCreditAction(formData);
      else await action(formData);
      setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar. Revisá la cuenta antes de reintentar."); }
    finally { submitting.current = false; setPending(false); }
  }

  return <>
    <Button className={triggerClassName} onClick={() => { clearSelection(defaultCustomerId ?? ""); setOpen(true); }} size="sm" type="button">{triggerLabel}</Button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5">
      <button type="button" aria-label="Cerrar panel de registro" className="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-[2px]" onClick={close} disabled={pending} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}
        className="relative z-10 max-h-[94dvh] w-full max-w-[1060px] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key !== "Tab") return;
          const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length > 0);
          const first = elements[0]; const last = elements.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
          <div><h2 id={`${id}-title`} className="text-2xl font-bold tracking-tight">{creditMode ? "Aplicar crédito" : "Registrar pago"}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{customers.find((c) => c.id === clientId)?.name || "Seleccioná un cliente"}</p></div>
          <button type="button" aria-label="Cerrar" onClick={close} disabled={pending} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50">✕</button>
        </header>
        <form action={submit}>
          <input name="clientId" type="hidden" value={clientId} />
          <input name="allocations" type="hidden" value={JSON.stringify(allocations)} />
          <input name="requestId" type="hidden" value={requestId} />
          <fieldset disabled={pending} className="min-w-0">
            {!defaultCustomerId ? <div className="border-b border-slate-100 px-5 py-4 sm:px-7"><Field htmlFor={`${id}-customer`} label="Cliente" required>
              <SearchableSelect id={`${id}-customer`} onChange={clearSelection} options={customers.map((c) => ({ value: c.id, label: c.name }))} value={clientId} placeholder="Buscar cliente" required />
            </Field></div> : null}
            {reconciliation ? <div className="border-b border-slate-100 px-5 py-4 sm:px-7">
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Remitos pendientes</dt><dd className="mt-1 font-semibold tabular-nums">{formatCurrency(reconciliation.pendingRemittances)}</dd></div>
                <div><dt className="text-xs text-slate-500">Crédito pendiente de imputar</dt><dd className="mt-1 font-semibold text-emerald-700 tabular-nums">{formatCurrency(reconciliation.availableCredit)}</dd></div>
                <div><dt className="text-xs text-slate-500">{reconciliation.accountBalance < 0 ? "Saldo neto a favor" : "Saldo final de la cuenta"}</dt><dd className="mt-1 font-semibold tabular-nums">{formatCurrency(Math.abs(reconciliation.accountBalance))}</dd></div>
              </dl>
              {reconciliation.needsReview ? <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Hay otros movimientos o inconsistencias por {formatCurrency(Math.abs(reconciliation.difference))} que requieren revisión. No se redistribuyen ni se consideran crédito disponible automáticamente.</p> : <p className="mt-2 text-xs text-slate-500">El saldo final ya descuenta el crédito existente. La imputación a remitos se hace sólo con tu selección.</p>}
            </div> : null}
            {credits.length > 0 ? <div className="border-b border-slate-100 bg-emerald-50/40 px-5 py-4 sm:px-7">
              <p className="text-sm font-medium text-emerald-900">Crédito disponible para imputar: {formatCurrency(round(credits.reduce((sum, c) => sum + c.amount, 0)))}</p>
              <p className="mt-1 text-xs text-slate-500">Ya está descontado del saldo de la cuenta. Imputarlo no es recibir otro pago.</p>
              {canApplyCredit ? <div className="mt-3 flex flex-wrap gap-2">{(["payment", "credit"] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold", mode === value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500")} onClick={() => { setMode(value); setAmounts({}); setError(""); setRequestId(crypto.randomUUID()); }}>{value === "payment" ? "Registrar dinero recibido" : "Aplicar crédito existente"}</button>)}</div> : <p className="mt-2 text-xs text-slate-500">La imputación de créditos requiere permiso de aprobación de cobranzas.</p>}
            </div> : null}
            <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-6 p-5 sm:p-7">
                <section aria-labelledby={`${id}-data`}>
                  <h3 id={`${id}-data`} className="mb-4 flex items-center gap-2.5 text-sm font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-blue-50 text-xs text-blue-700">1</span>{creditMode ? "Crédito a utilizar" : "Datos del cobro"}</h3>
                  {creditMode ? <><Field htmlFor={`${id}-source`} label="Origen del crédito" required><Select id={`${id}-source`} name="sourceId" value={sourceId} onChange={(e) => setSourceId(e.target.value)} required><option value="">Seleccionar crédito</option>{credits.map((c) => <option key={c.sourceId} value={c.sourceId}>{c.label} · {formatCurrency(c.amount)}</option>)}</Select></Field><p className="mt-3 text-xs leading-relaxed text-slate-500">Sin dinero nuevo ni movimiento en Tesorería. Sólo se aplica a los remitos seleccionados abajo.</p></> : <>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                      <Field htmlFor={`${id}-amount`} label="Importe recibido" required><MoneyInput id={`${id}-amount`} name="amount" value={amount} onValueChange={setAmount} min="0.01" required className="min-h-14 rounded-xl border-blue-200 bg-blue-50/30 text-xl font-semibold" /><p className="mt-1.5 text-[11px] text-slate-400">El total que realmente abonó el cliente.</p></Field>
                      <Field htmlFor={`${id}-date`} label="Fecha del pago" required><Input id={`${id}-date`} name="date" type="date" defaultValue={today} required className="min-h-14 rounded-xl text-sm" /></Field>
                    </div>
                    <fieldset className="mt-5"><legend className="mb-2 text-xs font-medium text-slate-600">Medio de pago</legend><input type="hidden" name="method" value={method} /><div className="grid grid-cols-3 gap-2">{METHODS.map((m) => <button key={m.value} type="button" aria-pressed={method === m.value} onClick={() => { setMethod(m.value); setAccountId(m.value === "echeck" ? "" : treasuryAccounts.find((a) => m.value === "efectivo" ? a.accountType === "cash" : ["bank", "wallet"].includes(a.accountType))?.id ?? ""); }} className={cn("min-h-16 rounded-xl border px-2 py-3 text-left sm:px-3", method === m.value ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 hover:bg-slate-50")}><span className="block text-xs font-semibold sm:text-sm">{m.label}</span><span className="mt-1 hidden text-[11px] text-slate-500 sm:block">{m.hint}</span></button>)}</div></fieldset>
                    <div key={method} className="mt-4 grid gap-4 sm:grid-cols-2">
                      {method === "echeck" ? <Field htmlFor={`${id}-due`} label="Fecha de cobro" required><Input id={`${id}-due`} name="chequeDueDate" type="date" defaultValue={today} required className="min-h-11 rounded-xl text-sm" /></Field> : <Field htmlFor={`${id}-account`} label="Cuenta de destino" required><Select id={`${id}-account`} name="treasuryAccountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} required className="min-h-11 rounded-xl text-sm"><option value="">Seleccionar cuenta</option>{eligibleAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
                      <Field htmlFor={`${id}-operation`} label={method === "echeck" ? "Número de E-cheq" : method === "efectivo" ? "Referencia (opcional)" : "Número de operación"} required={collectionMethodRequiresOperation(method)}><Input id={`${id}-operation`} name="operation" required={collectionMethodRequiresOperation(method)} inputMode={method === "echeck" ? "numeric" : undefined} pattern={method === "echeck" ? "[0-9]{1,20}" : undefined} placeholder={method === "echeck" ? "Sólo números" : "Número o referencia"} className="min-h-11 rounded-xl text-sm" /></Field>
                    </div>
                    {method === "echeck" ? <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-800"><strong>Cheque pendiente de cobro.</strong> Se incorpora a Tesorería con su fecha de cobro; todavía no suma al saldo disponible del banco.</p> : null}
                  </>}
                </section>
                <section aria-labelledby={`${id}-remittances`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 id={`${id}-remittances`} className="flex items-center gap-2.5 text-sm font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-blue-50 text-xs text-blue-700">2</span>Aplicar a remitos pendientes</h3>{selected.length > 0 ? <button type="button" onClick={() => setAmounts({})} className="text-xs font-medium text-blue-700 hover:underline">Quitar selección</button> : null}</div>
                  <p className="mb-4 text-xs leading-relaxed text-slate-500">Se aplica únicamente a los remitos que selecciones. Podés ajustar un importe parcial; cualquier excedente queda como saldo a favor.</p>
                  {loading ? <p role="status" className="py-4 text-sm text-slate-500">Buscando remitos pendientes…</p> : null}
                  {loadError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{loadError}</p> : null}
                  {!loading && !loadError && clientId && remittances.length === 0 ? <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No tiene remitos pendientes. Un nuevo pago quedará completo como saldo a favor.</p> : null}
                  <div className="space-y-2.5">{remittances.map((sale) => {
                    const checked = Object.hasOwn(amounts, sale.saleId);
                    const bad = checked && (!Number.isFinite(Number(amounts[sale.saleId])) || Number(amounts[sale.saleId]) <= 0 || Number(amounts[sale.saleId]) - sale.outstanding > 0.005);
                    return <div key={sale.saleId} className={cn("rounded-xl border p-3.5", checked ? "border-blue-200 bg-blue-50/25" : "border-slate-200")}>
                      <div className="flex items-center gap-3"><input id={`${id}-${sale.saleId}`} type="checkbox" checked={checked} onChange={() => toggle(sale)} aria-label={`Seleccionar ${sale.number}`} className="size-4 shrink-0 accent-blue-600" /><label htmlFor={`${id}-${sale.saleId}`} className="min-w-0 flex-1 cursor-pointer"><span className="block text-sm font-semibold">{sale.number}</span><span className="mt-1 block text-[11px] text-slate-500">{formatDate(sale.date)}{sale.total !== sale.outstanding ? " · Con imputaciones previas" : ""}</span></label><div className="text-right"><span className="block text-[10px] text-slate-400">Pendiente</span><strong className="mt-1 block whitespace-nowrap text-sm tabular-nums">{formatCurrency(sale.outstanding)}</strong></div></div>
                      {checked ? <div className="ml-7 mt-3 grid items-center gap-2 border-t border-blue-100 pt-3 sm:grid-cols-[minmax(0,1fr)_180px]"><label htmlFor={`${id}-amount-${sale.saleId}`} className="text-xs text-slate-500">Importe a aplicar</label><MoneyInput id={`${id}-amount-${sale.saleId}`} aria-label={`Importe aplicado a ${sale.number}`} value={amounts[sale.saleId]} onValueChange={(rawValue) => setAmounts((current) => ({ ...current, [sale.saleId]: rawValue }))} min="0.01" required aria-invalid={bad} className={cn("min-h-10 rounded-lg text-right text-sm font-semibold", bad && "border-rose-400")} />{bad ? <p role="alert" className="text-xs text-rose-700 sm:col-span-2">Ingresá un importe mayor a cero y hasta {formatCurrency(sale.outstanding)}.</p> : null}</div> : null}
                    </div>;
                  })}</div>
                  {!creditMode && !loading && selected.length === 0 && clientId ? <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800">Sin remitos seleccionados: el importe completo quedará como saldo a favor.</p> : null}
                </section>
                {!creditMode ? <details className="border-t border-slate-100 pt-5"><summary className="cursor-pointer text-xs font-medium text-slate-500">Agregar una nota o aclaración (opcional)</summary><label className="sr-only" htmlFor={`${id}-notes`}>Notas</label><textarea id={`${id}-notes`} name="notes" rows={2} className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Detalle adicional del pago…" /></details> : null}
              </div>
              <aside aria-label="Resumen del pago" className="border-t border-slate-100 bg-slate-50/60 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-5"><div className="lg:sticky lg:top-5">
                <h3 className="text-sm font-semibold">{creditMode ? "Así quedaría el crédito" : "Así quedaría el pago"}</h3><p className="mt-1 text-xs text-slate-500">Revisá los importes antes de registrar.</p>
                <dl className="mt-6 space-y-5"><div><dt className="text-xs text-slate-500">{creditMode ? "Crédito disponible elegido" : "Recibido del cliente"}</dt><dd className="mt-2 break-words text-3xl font-bold tracking-tight tabular-nums">{formatCurrency(available)}</dd></div><div className="border-t border-slate-200 pt-4"><dt className="flex justify-between gap-2 text-xs text-slate-500"><span>Aplicado a remitos</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{selected.length} de {remittances.length}</span></dt><dd className="mt-2 text-xl font-semibold text-blue-700 tabular-nums">{formatCurrency(applied)}</dd></div><div className={cn("rounded-xl border p-4", invalid ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50")}><dt className="text-xs font-medium">{creditMode ? "Crédito restante" : "Saldo a favor"}</dt><dd className="mt-2 text-2xl font-semibold text-emerald-700 tabular-nums">{invalid ? "—" : formatCurrency(remaining)}</dd><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{creditMode ? "La deuda total no cambia: el crédito ya estaba descontado." : "El excedente no se aplica automáticamente a otros remitos."}</p></div></dl>
                {applied - available > 0.005 ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">Lo aplicado supera {creditMode ? "el crédito elegido" : "el importe recibido"} por {formatCurrency(applied - available)}. Ajustá los importes.</p> : null}
                <p className="mt-5 text-[11px] leading-relaxed text-slate-400">No hay distribución automática. Sólo se imputan los importes que elegiste.</p>
              </div></aside>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-5 py-4 sm:px-7"><p className="max-w-sm text-[11px] leading-relaxed text-slate-400">{creditMode ? "No registra dinero nuevo, no modifica facturas ni stock." : "Se envía a aprobación si tu usuario no tiene permiso para aprobar cobros."}</p><div className="flex items-center gap-2"><Button type="button" variant="secondary" onClick={close}>Cancelar</Button><Button type="submit" disabled={invalid || pending}>{pending ? "Guardando…" : creditMode ? "Aplicar crédito" : "Registrar pago"}</Button></div>{error ? <p role="alert" className="basis-full rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}</footer>
          </fieldset>
        </form>
      </div>
    </div> : null}
  </>;
}
