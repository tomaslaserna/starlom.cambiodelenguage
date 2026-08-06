"use client";

import { useState } from "react";
import type { QuoteBucket, TopQuoteClient, VendorQuote } from "@/lib/crm-quotes";

type Props = {
  buckets: Record<QuoteBucket, VendorQuote[]>;
  counts: Record<QuoteBucket, number>;
  topClients: TopQuoteClient[];
};

const BUCKETS = [
  { key: "vigentes", label: "Vigentes", sub: "en fecha", color: "var(--success)", bg: "var(--success-subtle)" },
  { key: "por_vencer", label: "Por vencer", sub: "≤ 3 días", color: "var(--warning)", bg: "var(--warning-subtle)" },
  { key: "vencidos", label: "Vencidos", sub: "sin respuesta", color: "var(--danger)", bg: "var(--danger-subtle)" },
  { key: "aceptados", label: "Aceptados", sub: "este mes", color: "var(--info)", bg: "var(--info-subtle)" },
] as const;

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function vencimientoLegend(bucket: QuoteBucket, days: number | null) {
  if (bucket === "aceptados") return "aceptado";
  if (days == null) return "";
  if (bucket === "vencidos") return `vencido hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`;
  if (days === 0) return "vence hoy";
  return `vence en ${days} ${days === 1 ? "día" : "días"}`;
}

export function PresupuestosDashboard({ buckets, counts, topClients }: Props) {
  const [selected, setSelected] = useState<QuoteBucket>("por_vencer");
  const current = BUCKETS.find((bucket) => bucket.key === selected) ?? BUCKETS[0];
  const rows = buckets[selected] ?? [];

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BUCKETS.map((bucket) => {
          const active = bucket.key === selected;
          return (
            <button
              key={bucket.key}
              type="button"
              onClick={() => setSelected(bucket.key)}
              className="rounded-[14px] border bg-[color:var(--panel)] p-4 text-left shadow-[var(--shadow-xs)] transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]"
              style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                boxShadow: active ? "0 0 0 3px var(--focus-soft)" : undefined,
              }}
            >
              <div
                className="text-[1.75rem] font-bold leading-none tabular-nums"
                style={{ color: bucket.color }}
              >
                {counts[bucket.key] ?? 0}
              </div>
              <div className="erp-text-body mt-1 font-semibold text-[color:var(--foreground)]">{bucket.label}</div>
              <div className="erp-text-caption text-[color:var(--muted)]">{bucket.sub}</div>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
        <div className="flex items-center gap-2 border-b border-[color:var(--border)] px-4 py-3">
          <span
            className="erp-text-caption rounded-full px-2.5 py-1 font-bold"
            style={{ background: current.bg, color: current.color }}
          >
            {current.label}
          </span>
          <span className="erp-text-body-sm font-semibold text-[color:var(--foreground)]">
            {rows.length} {rows.length === 1 ? "presupuesto" : "presupuestos"}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="erp-text-body-sm px-4 py-8 text-center text-[color:var(--muted)]">
            No hay presupuestos en este estado.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {rows.map((quote) => (
              <li
                key={quote.id}
                className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
              >
                <div>
                  <div className="erp-text-body font-semibold text-[color:var(--foreground)]">
                    {quote.clientName || "Sin cliente"}
                  </div>
                  <div className="erp-text-caption text-[color:var(--muted)]">{quote.quoteNumber}</div>
                </div>
                <div className="erp-text-body-sm tabular-nums text-[color:var(--foreground)]">
                  <span className="block erp-text-caption text-[color:var(--muted)]">Total</span>
                  {ars.format(quote.total)}
                </div>
                <div className="erp-text-body-sm tabular-nums text-[color:var(--muted)]">
                  <span className="block erp-text-caption">Vencimiento</span>
                  {vencimientoLegend(selected, quote.daysRemaining)}
                </div>
                <a
                  href={`/api/pdfs/quotes/${quote.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="erp-text-body-sm justify-self-start rounded-[9px] border border-[color:var(--accent)] bg-[color:var(--accent)] px-3 py-2 font-semibold text-white transition-colors hover:bg-[color:var(--accent-strong)] sm:justify-self-end"
                >
                  Ver PDF
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {topClients.length > 0 && (
        <div className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <span className="erp-text-body-sm font-semibold text-[color:var(--foreground)]">Clientes que piden mucho</span>
            <span className="erp-text-caption ml-2 text-[color:var(--muted)]">por cantidad de presupuestos</span>
          </div>
          <ul className="divide-y divide-[color:var(--border)]">
            {topClients.map((client) => (
              <li key={client.clientName} className="flex items-center justify-between px-4 py-3">
                <span className="erp-text-body font-semibold text-[color:var(--foreground)]">{client.clientName}</span>
                <span className="erp-text-body-sm tabular-nums text-[color:var(--muted)]">
                  {client.cantidad} pedidos · {client.aceptados} aceptados
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
