"use client";

import { useMemo, useState } from "react";
import type { CrmClient } from "@/lib/crm";

type Props = {
  groups: Record<string, CrmClient[]>;
  counts: Record<string, number>;
  zonas: string[];
  agendar: (formData: FormData) => Promise<void>;
};

const STATES = [
  { key: "al_dia", label: "Activos", sub: "compran al dia", color: "var(--success)", bg: "var(--success-subtle)" },
  { key: "contactar", label: "A recontactar", sub: "se acerca su compra", color: "var(--info)", bg: "var(--info-subtle)" },
  { key: "riesgo", label: "En riesgo", sub: "atrasados", color: "var(--warning)", bg: "var(--warning-subtle)" },
  { key: "perdido", label: "Perdidos", sub: "hace mucho sin comprar", color: "var(--danger)", bg: "var(--danger-subtle)" },
  { key: "sin_historial", label: "Sin historial", sub: "nuevos / pocos datos", color: "var(--muted)", bg: "var(--panel-muted)" },
] as const;

export function ClientesDashboard({ groups, counts, zonas, agendar }: Props) {
  const [selected, setSelected] = useState<string>("contactar");
  const [zona, setZona] = useState<string>("todas");

  const current = STATES.find((state) => state.key === selected) ?? STATES[1];
  const rows = useMemo(() => {
    const list = groups[selected] ?? [];
    return zona === "todas" ? list : list.filter((client) => client.zona === zona);
  }, [groups, selected, zona]);

  return (
    <div className="grid gap-5">
      {/* Tarjetas por estado */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STATES.map((state) => {
          const active = state.key === selected;
          return (
            <button
              key={state.key}
              type="button"
              onClick={() => setSelected(state.key)}
              className="rounded-[14px] border bg-[color:var(--panel)] p-4 text-left shadow-[var(--shadow-xs)] transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]"
              style={{ borderColor: active ? "var(--accent)" : "var(--border)", boxShadow: active ? "0 0 0 3px var(--focus-soft)" : undefined }}
            >
              <div
                className="mb-2.5 grid h-12 w-12 place-items-center rounded-full"
                style={{ background: state.bg, color: state.color }}
              >
                <StateIcon name={state.key} />
              </div>
              <div className="text-[1.75rem] font-bold leading-none tabular-nums" style={{ color: state.color }}>
                {counts[state.key] ?? 0}
              </div>
              <div className="erp-text-body mt-1 font-semibold text-[color:var(--foreground)]">{state.label}</div>
              <div className="erp-text-caption text-[color:var(--muted)]">{state.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Auto-agenda (fase 2) */}
      <div
        className="flex items-center gap-3 rounded-[12px] border p-3.5 erp-text-body-sm"
        style={{ borderColor: "var(--accent-secondary-subtle)", background: "var(--accent-secondary-subtle)" }}
      >
        <span aria-hidden className="text-base">📅</span>
        <span>
          <b>Agenda a los clientes a recontactar</b> con el boton de cada fila y te queda el recordatorio en tu
          calendario. Pronto Starlim los va a agendar solo cuando crucen su promedio de compra.
        </span>
      </div>

      {/* Filtro por zona */}
      <div className="flex flex-wrap gap-2">
        <ZoneChip label="Todas las zonas" active={zona === "todas"} onClick={() => setZona("todas")} />
        {zonas.map((zone) => (
          <ZoneChip key={zone} label={zone} active={zona === zone} onClick={() => setZona(zone)} />
        ))}
      </div>

      {/* Lista del estado elegido */}
      <div className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
        <div className="flex items-center gap-2 border-b border-[color:var(--border)] px-4 py-3">
          <span
            className="erp-text-caption rounded-full px-2.5 py-1 font-bold"
            style={{ background: current.bg, color: current.color }}
          >
            {current.label}
          </span>
          <span className="erp-text-body-sm font-semibold text-[color:var(--foreground)]">
            {rows.length} {rows.length === 1 ? "cliente" : "clientes"}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="erp-text-body-sm px-4 py-8 text-center text-[color:var(--muted)]">
            No hay clientes en este estado para la zona elegida.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {rows.map((client) => (
              <li key={client.customerId} className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[1.6fr_1fr_1fr_auto]">
                <div>
                  <div className="erp-text-body font-semibold text-[color:var(--foreground)]">{client.customerName}</div>
                  <div className="erp-text-caption text-[color:var(--muted)]">
                    {client.zona} · {client.relation}
                    {client.phone ? ` · ${client.phone}` : ""}
                  </div>
                </div>
                <div className="erp-text-body-sm tabular-nums text-[color:var(--muted)]">
                  <span className="block erp-text-caption">Ultima compra</span>
                  {client.daysSinceLastPurchase == null ? "—" : `hace ${client.daysSinceLastPurchase} dias`}
                </div>
                <div className="erp-text-body-sm tabular-nums text-[color:var(--muted)]">
                  <span className="block erp-text-caption">Promedio</span>
                  {client.averageDays == null ? "—" : `cada ${client.averageDays} dias`}
                </div>
                <form action={agendar} className="justify-self-start sm:justify-self-end">
                  <input type="hidden" name="customerName" value={client.customerName} />
                  <button
                    type="submit"
                    className="erp-text-body-sm rounded-[9px] border border-[color:var(--accent)] bg-[color:var(--accent)] px-3 py-2 font-semibold text-white transition-colors hover:bg-[color:var(--accent-strong)]"
                  >
                    Agendar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StateIcon({ name }: { name: string }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "al_dia") return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
  if (name === "contactar") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "riesgo") return <svg {...common}><path d="M12 3 1.5 21h21z" /><path d="M12 9v5M12 17.5h.01" /></svg>;
  if (name === "perdido") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>;
}

function ZoneChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="erp-text-body-sm rounded-full border px-3.5 py-1.5 font-semibold transition-colors"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "var(--accent)" : "var(--panel)",
        color: active ? "#fff" : "var(--muted)",
      }}
    >
      {label}
    </button>
  );
}
