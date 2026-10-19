"use client";

import Link from "next/link";
import { Fragment, useState, type FormEvent } from "react";
import { Button, Input, cn, EmptyState } from "@/components/ui";
import type { CustomerStatement } from "@/lib/customer-accounts";
import { filterStatementLines, statementMovementPresentation, type StatementCategory } from "@/lib/customer-statement-presentation";
import { formatCurrency, formatDate } from "@/lib/format";

const filters = [
  { value: "todos", label: "Todos" },
  { value: "remito", label: "Remitos" },
  { value: "pago", label: "Pagos" },
  { value: "notas", label: "Notas" },
  { value: "ajuste", label: "Ajustes" },
] as const;

export function StatementDateFilter({ clientId, from, to }: { clientId: string; from: string; to: string }) {
  const [error, setError] = useState("");
  function validateDates(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const start = String(data.get("from") ?? "");
    const end = String(data.get("to") ?? "");
    if (start && end && start > end) {
      event.preventDefault();
      setError("La fecha desde debe ser anterior o igual a la fecha hasta.");
    } else setError("");
  }
  return (
    <details open={Boolean(from || to)} className="group">
      <summary className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Filtrar por fecha{from || to ? " · activo" : ""}</summary>
      <form action={`/payments/accounts/${clientId}`} method="get" onSubmit={validateDates} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-xs text-slate-500">Desde<Input name="from" type="date" aria-label="Desde" defaultValue={from} /></label>
        <label className="grid gap-1.5 text-xs text-slate-500">Hasta<Input name="to" type="date" aria-label="Hasta" defaultValue={to} /></label>
        <Button type="submit">Aplicar</Button>
        {from || to ? <Link href={`/payments/accounts/${clientId}`} className="inline-flex min-h-10 items-center px-3 text-xs font-semibold text-blue-700 hover:underline">Limpiar</Link> : null}
        {error ? <p role="alert" className="basis-full text-xs text-rose-700">{error}</p> : null}
      </form>
    </details>
  );
}

export function StatementMovements({ statement, from, to }: { statement: CustomerStatement; from: string; to: string }) {
  const [filter, setFilter] = useState<"todos" | "notas" | StatementCategory>("todos");
  const [expanded, setExpanded] = useState<string | null>(null);
  const lines = filterStatementLines(statement.lines, filter);
  const filteredPeriod = Boolean(from || to);
  return (
    <>
      <div className="space-y-3 border-b border-slate-100 px-5 pb-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de movimiento">
          {filters.map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setExpanded(null); }} className={cn("min-h-9 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500", filter === value ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100")}>{label}</button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          {filteredPeriod ? `Período: ${from ? formatDate(from) : "inicio"} a ${to ? formatDate(to) : "último movimiento"}. ` : "Historial completo. "}
          <span className="font-medium text-slate-700">+ aumenta la deuda</span> · <span className="font-medium text-emerald-700">− la reduce</span>
        </p>
        {filter !== "todos" ? <p className="text-xs text-blue-700">{lines.length} movimientos visibles. Cada saldo conserva todos los movimientos, incluso los que no se muestran.</p> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm" aria-label="Estado de cuenta">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="w-[110px] px-5 py-3">Fecha</th>
              <th scope="col" className="px-5 py-3">Movimiento</th>
              <th scope="col" className="px-5 py-3 text-right">Importe</th>
              <th scope="col" className="px-5 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 bg-slate-50/50">
              <td className="px-5 py-3 text-xs text-slate-400">{from ? formatDate(from) : "—"}</td>
              <th scope="row" className="px-5 py-3 text-left text-xs font-medium text-slate-500">Saldo anterior{filteredPeriod ? " al período" : ""}</th>
              <td className="px-5 py-3 text-right text-slate-400">—</td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-sm font-medium tabular-nums">{formatCurrency(statement.openingBalance)}</td>
            </tr>
            {lines.map((line) => {
              const display = statementMovementPresentation(line);
              const open = expanded === line.id;
              return (
                <Fragment key={line.id}>
                  <tr className={cn("border-t border-slate-100 transition-colors hover:bg-slate-50/60", open && "bg-blue-50/30")}>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{formatDate(line.date)}</td>
                    <td className="px-5 py-4">
                      <span className={cn("mb-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", display.className)}>{display.label}</span>
                      <div>
                        <button type="button" aria-label={`${open ? "Ocultar" : "Ver"} detalle de ${display.title}`} aria-expanded={open} aria-controls={`movement-${line.id}`} onClick={() => setExpanded(open ? null : line.id)} className="inline-flex items-center gap-2 text-left font-semibold text-slate-900 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-500">
                          {display.title}<span aria-hidden="true" className="text-xs text-slate-400">{open ? "⌃" : "⌄"}</span>
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{display.subtitle}</p>
                    </td>
                    <td className={cn("whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums", display.amount < 0 ? "text-emerald-700" : "text-slate-900")}>{display.amount < 0 ? "− " : display.amount > 0 ? "+ " : ""}{formatCurrency(Math.abs(display.amount))}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <strong className={cn("text-base font-semibold tabular-nums", line.balance < 0 ? "text-emerald-700" : "text-slate-900")}>{formatCurrency(Math.abs(line.balance))}</strong>
                      {line.balance < 0 ? <span className="mt-0.5 block text-[11px] text-emerald-700">a favor</span> : null}
                    </td>
                  </tr>
                  <tr id={`movement-${line.id}`} hidden={!open}>
                    <td colSpan={4} className="border-t border-blue-100 bg-blue-50/30 px-5 py-4 sm:px-8">
                      <p className="max-w-3xl whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">{line.description || "Sin detalle adicional"}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {line.debit > 0 && line.saleId && line.hasPricedItems ? <Link className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-blue-700 hover:border-blue-300" href={`/api/pdfs/orders/${line.saleId}/remito?precios=si`} prefetch={false} target="_blank">Ver remito ↗</Link> : null}
                        {line.debit > 0 && line.saleId && line.hasFiscalPdf ? <Link className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-blue-700 hover:border-blue-300" href={`/api/pdfs/fiscal/sales/${line.saleId}`} prefetch={false} target="_blank">Ver factura ↗</Link> : null}
                        {line.internalDocumentId ? <Link className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-blue-700 hover:border-blue-300" href={`/api/pdfs/sales/notes/${line.internalDocumentId}`} prefetch={false} target="_blank">Ver nota interna #{line.internalDocumentNumber ?? "-"} ↗</Link> : null}
                        {line.fiscalDocumentId ? <Link className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-blue-700 hover:border-blue-300" href={`/api/pdfs/fiscal/notes/${line.fiscalDocumentId}`} prefetch={false} target="_blank">Ver nota de crédito fiscal{line.fiscalDocumentNumber ? ` #${line.fiscalDocumentNumber}` : ""} ↗</Link> : null}
                      </div>
                      {line.debit > 0 && line.credit > 0 ? <p className="mt-3 text-xs text-slate-500">Debe: {formatCurrency(line.debit)} · Haber: {formatCurrency(line.credit)} · Importe neto mostrado en la fila.</p> : null}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {lines.length === 0 ? <tr><td colSpan={4} className="px-5 py-8"><EmptyState title="Sin movimientos" description="No hay movimientos para estos filtros." /></td></tr> : null}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50">
            <tr><th colSpan={3} scope="row" className="px-5 py-4 text-left text-sm font-semibold">{filteredPeriod ? "Saldo al cierre del período" : "Saldo final de la cuenta"}</th><td className={cn("whitespace-nowrap px-5 py-4 text-right text-lg font-bold tabular-nums", statement.finalBalance < 0 && "text-emerald-700")}>{formatCurrency(Math.abs(statement.finalBalance))}{statement.finalBalance < 0 ? <span className="mt-0.5 block text-[11px] font-medium">a favor</span> : null}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Ordenados del más antiguo al más reciente · Abrí un movimiento para ver sus documentos y referencias.</div>
    </>
  );
}
