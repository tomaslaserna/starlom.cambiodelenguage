"use client";

import { useState, type ReactNode } from "react";
import type { PortalHistoryScope } from "@/lib/portal-history";
import { formatDate } from "@/lib/format";

export function PortalHistorySection({ id, scope, children }: { id: string; scope: PortalHistoryScope | null; children: (complete: boolean) => ReactNode }) {
  const [complete, setComplete] = useState(false);
  return <section id={id} aria-label={id === "pedidos" ? "Historial de pedidos de mi sucursal" : "Historial de pagos de mi sucursal"} className="scroll-mt-20">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[#64748b]">{complete ? "Historial completo de esta sucursal" : scope ? scope.lastZeroDate ? `Desde el último saldo cero · ${formatDate(scope.lastZeroDate)}` : "Sin cierres anteriores: se muestra todo el historial" : "Consultando último cierre…"}</p>
      <button type="button" aria-expanded={complete} className="min-h-10 rounded-xl border border-[#bcd5ef] bg-white px-4 py-2 text-sm font-bold text-[#075ac7] hover:bg-[#eef6ff]" onClick={() => setComplete((value) => !value)}>{complete ? "Último período" : "Ver todo el historial"}</button>
    </div>
    {complete || scope ? children(complete) : <p role="status" className="rounded-2xl border border-[#dbe5f1] bg-white p-5 text-sm text-[#64748b]">Cargando historial… Podés consultar el historial completo mientras tanto.</p>}
  </section>;
}
