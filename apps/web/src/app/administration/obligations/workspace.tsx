"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CostPaymentWorkspace } from "@/lib/cost-obligations-read";
import type { CostObligation } from "@/lib/cost-obligations-core";
const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    n / 100,
  );
const field =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm";
const primary =
  "rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40";
const secondary =
  "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40";
const cents = (s: string) =>
  /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s)
    ? Math.round(Number(s.replaceAll(".", "").replace(",", ".")) * 100)
    : NaN;
export function CostObligationsWorkspace({
  endpoint,
  local = false,
}: {
  endpoint: string;
  local?: boolean;
}) {
  const [data, setData] = useState<CostPaymentWorkspace | null>(null),
    [month, setMonth] = useState(local ? "2026-11" : ""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showPaid, setShowPaid] = useState(false);
  const [creating, setCreating] = useState(""),
    [due, setDue] = useState(""),
    [paying, setPaying] = useState<CostObligation | null>(null),
    [account, setAccount] = useState(""),
    [date, setDate] = useState(""),
    [amount, setAmount] = useState(""),
    [mode, setMode] = useState("new"),
    [existing, setExisting] = useState(""),
    [confirm, setConfirm] = useState(false);
  const lock = useRef(false),
    request = useRef("");
  const load = useCallback(async () => {
    const r = await fetch(endpoint + (month ? "?month=" + month : ""), {
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    return d as CostPaymentWorkspace;
  }, [endpoint, month]);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
  async function send(body: unknown) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(await load());
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se verificó el resultado. Reintentá sin cambiar los datos.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function openPay(o: CostObligation) {
    setPaying(o);
    setCreating("");
    setAccount("");
    setDate(data!.today);
    setAmount(
      (o.balanceCents / 100).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
      }),
    );
    setMode("new");
    setExisting("");
    setConfirm(false);
    setError("");
    request.current = crypto.randomUUID();
  }
  if (!data)
    return <main className="p-8">{error || "Cargando obligaciones…"}</main>;
  const selectedMonth = month || data.month,
    rows = data.obligations.filter((o) => o.month === selectedMonth),
    visible = rows.filter((o) => showPaid || o.balanceCents > 0);
  const available = data.costs.filter(
    (c) => c.status === "included" && !rows.some((o) => o.costId === c.id),
  );
  const manual = data.movements.filter(
    (m) =>
      !m.linked &&
      m.date <= data.today &&
      m.amountCents <= (paying?.balanceCents ?? 0),
  );
  return (
    <main className="min-h-screen bg-[#f3f6fb] p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-blue-600">
              STARLIM · ADMINISTRACIÓN
            </p>
            <h1 className="mt-2 text-3xl font-extrabold">Gastos y pagos</h1>
            <p className="mt-2 text-sm text-slate-500">
              Del costo del mes al pago, con su cuenta de origen.
            </p>
          </div>
          <label className="text-sm font-semibold">
            Mes del costo
            <input
              aria-label="Mes del costo"
              type="month"
              value={selectedMonth}
              min={data.baselineMonth}
              className={field}
              onChange={(e) => {
                setMonth(e.target.value);
                setCreating("");
                setPaying(null);
                setMessage("");
              }}
            />
          </label>
        </header>
        {local ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Vista local funcional · datos de ejemplo.</strong> Los pagos
            sólo afectan la base de prueba de este equipo.
          </p>
        ) : (
          <a
            className="text-sm text-blue-600"
            href="/administration?view=obligations"
          >
            Volver a Administración
          </a>
        )}
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
            {error}
          </p>
        ) : null}
        {message ? (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-4 text-emerald-900"
          >
            {message}
          </p>
        ) : null}
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Pendiente de pago",
              value: money(rows.reduce((a, o) => a + o.balanceCents, 0)),
              sub: "Obligaciones del mes seleccionado",
            },
            {
              title: "Pagado / vinculado",
              value: money(rows.reduce((a, o) => a + o.paidCents, 0)),
              sub: "Cada pago tiene un único egreso asociado",
            },
            {
              title: "Gastos sin programar",
              value: available.length,
              sub: "Sin vencimientos ni egresos todavía",
            },
          ].map((c, i) => (
            <div
              key={c.title}
              className={
                "rounded-2xl border p-5 " +
                (i === 0
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white")
              }
            >
              <p className="text-xs uppercase">{c.title}</p>
              <strong className="mt-2 block text-3xl tabular-nums">
                {c.value}
              </strong>
              <p className="mt-2 text-xs opacity-75">{c.sub}</p>
            </div>
          ))}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">Programar un gasto del mes</h2>
          <p className="mt-1 text-sm text-slate-500">
            Elegí el costo y su vencimiento. El importe viene del circuito
            mensual.
          </p>
          <form
            className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_180px_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await send({
                  intent: "create",
                  costId: creating,
                  month: selectedMonth,
                  dueDate: due,
                  expectedRevision: data.revision,
                })
              ) {
                setCreating("");
                setMessage(
                  "Obligación creada. No se movió dinero ni se agregó otro costo.",
                );
              }
            }}
          >
            <label className="text-sm">
              Costo
              <select
                aria-label="Costo a programar"
                required
                className={field}
                value={creating}
                onChange={(e) => {
                  setCreating(e.target.value);
                  setDue(data.today);
                  setPaying(null);
                }}
              >
                <option value="">Seleccionar costo…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {money(c.totalCents)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Vencimiento
              <input
                required
                type="date"
                min={data.baselineMonth + "-01"}
                className={field}
                value={due}
                onInput={(e) => setDue(e.currentTarget.value)}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <button disabled={busy || !creating} className={primary}>
              Crear obligación
            </button>
          </form>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <h2 className="font-bold">Obligaciones del mes</h2>
            <label className="flex gap-2 text-sm text-slate-500">
              <input
                type="checkbox"
                checked={showPaid}
                onChange={(e) => setShowPaid(e.target.checked)}
              />
              Ver también pagadas
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Concepto",
                    "Vencimiento",
                    "Importe",
                    "Pagado",
                    "Pendiente",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-5 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="p-5 font-semibold">
                      {o.concept}
                      <small className="mt-1 block font-normal text-slate-500">
                        Costo de {o.month}
                      </small>
                    </td>
                    <td className="p-5">
                      {o.dueDate.split("-").reverse().join("/")}
                    </td>
                    <td className="p-5 tabular-nums">{money(o.amountCents)}</td>
                    <td className="p-5 tabular-nums text-slate-500">
                      {money(o.paidCents)}
                    </td>
                    <td className="p-5 font-bold tabular-nums">
                      {money(o.balanceCents)}
                    </td>
                    <td className="p-5">
                      {o.balanceCents > 0 ? (
                        <button className={primary} onClick={() => openPay(o)}>
                          Registrar pago
                        </button>
                      ) : (
                        <span className="text-emerald-700">Pagada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length ? (
              <p className="p-6 text-sm text-slate-500">
                No hay obligaciones pendientes para este mes.
              </p>
            ) : null}
          </div>
        </section>
        {paying ? (
          <section className="rounded-2xl border-2 border-blue-200 bg-white p-5">
            <h2 className="text-lg font-bold">Pagar {paying.concept}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Pendiente {money(paying.balanceCents)} · admite pagos parciales
            </p>
            <fieldset disabled={busy || confirm} className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-5 text-sm">
                <label>
                  <input
                    type="radio"
                    checked={mode === "new"}
                    onChange={() => {
                      setMode("new");
                      setExisting("");
                    }}
                  />{" "}
                  Registrar nuevo egreso
                </label>
                <label>
                  <input
                    type="radio"
                    checked={mode === "existing"}
                    onChange={() => {
                      setMode("existing");
                      setExisting("");
                      setAccount("");
                      setAmount("");
                    }}
                  />{" "}
                  Vincular egreso ya registrado
                </label>
              </div>
              {mode === "existing" ? (
                <label className="block text-sm">
                  Egreso manual disponible
                  <select
                    className={field}
                    value={existing}
                    onChange={(e) => {
                      setExisting(e.target.value);
                      const m = manual.find((x) => x.id === e.target.value);
                      if (m) {
                        setAccount(m.accountId);
                        setDate(m.date);
                        setAmount(
                          (m.amountCents / 100).toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                          }),
                        );
                      }
                    }}
                  >
                    <option value="">Seleccionar egreso…</option>
                    {manual.map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.id} · {m.account} · {m.date} ·{" "}
                        {money(m.amountCents)} · {m.concept}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Vincula el importe completo sin volver a descontarlo de
                    caja.
                  </span>
                </label>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-sm">
                  Cuenta de origen
                  <select
                    disabled={mode === "existing"}
                    className={field}
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  >
                    <option value="">Seleccionar cuenta…</option>
                    {data.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Fecha de pago
                  <input
                    disabled={mode === "existing"}
                    type="date"
                    min={data.baselineMonth + "-01"}
                    max={data.today}
                    className={field}
                    value={date}
                    onInput={(e) => setDate(e.currentTarget.value)}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Importe $
                  <input
                    disabled={mode === "existing"}
                    inputMode="decimal"
                    className={field}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onBlur={() => {
                      const n = cents(amount);
                      if (Number.isFinite(n))
                        setAmount(
                          (n / 100).toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }),
                        );
                    }}
                  />
                </label>
              </div>
            </fieldset>
            {confirm ? (
              <div className="mt-5 rounded-xl bg-blue-50 p-4">
                <p className="font-semibold">
                  {mode === "new"
                    ? "Se registrará un único egreso"
                    : "Se vinculará el egreso existente"}{" "}
                  de {money(cents(amount))} en{" "}
                  {data.accounts.find((a) => a.id === account)?.name}.
                </p>
                <p className="mt-1 text-sm">
                  Quedará pendiente {money(paying.balanceCents - cents(amount))}
                  . El costo mensual no cambia.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    disabled={busy}
                    className={primary}
                    onClick={async () => {
                      if (
                        await send({
                          intent: "pay",
                          obligationId: paying.id,
                          requestId: request.current,
                          expectedPaidCents: paying.paidCents,
                          amountCents: cents(amount),
                          accountId: account,
                          date,
                          ...(mode === "existing"
                            ? { existingMovementId: existing }
                            : {}),
                        })
                      ) {
                        setPaying(null);
                        setConfirm(false);
                        setMessage(
                          mode === "new"
                            ? "Pago registrado: un egreso y saldo actualizado."
                            : "Egreso vinculado sin descontar dinero nuevamente.",
                        );
                      }
                    }}
                  >
                    {busy ? "Guardando…" : "Confirmar pago"}
                  </button>
                  <button
                    disabled={busy}
                    className={secondary}
                    onClick={() => setConfirm(false)}
                  >
                    Volver
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex gap-3">
                <button
                  className={primary}
                  disabled={
                    busy ||
                    !account ||
                    !date ||
                    !Number.isSafeInteger(cents(amount)) ||
                    cents(amount) <= 0 ||
                    cents(amount) > paying.balanceCents ||
                    (mode === "existing" && !existing)
                  }
                  onClick={() => setConfirm(true)}
                >
                  Revisar pago
                </button>
                <button className={secondary} onClick={() => setPaying(null)}>
                  Cancelar
                </button>
              </div>
            )}
          </section>
        ) : null}
        <details className="rounded-2xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer font-semibold">
            Egresos y trazabilidad
          </summary>
          <p className="mt-2 text-sm text-slate-500">
            Últimos 100 egresos manuales o del circuito desde su inicio.
          </p>
          {data.movements.map((m) => (
            <div
              key={m.id}
              className="mt-3 flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-3 text-sm"
            >
              <span>
                #{m.id} · {m.concept}
                <small className="block text-slate-500">
                  {m.account} · {m.date} ·{" "}
                  {m.linked ? "Vinculado a obligación" : "Sin vincular"}
                </small>
              </span>
              <strong className="tabular-nums">− {money(m.amountCents)}</strong>
            </div>
          ))}
        </details>
      </div>
    </main>
  );
}
