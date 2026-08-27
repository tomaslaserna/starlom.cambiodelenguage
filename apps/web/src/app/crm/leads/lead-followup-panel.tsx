"use client";

import { useMemo, useState } from "react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import type { LeadFollowupAgendaItem } from "@/lib/leads";

type Action = (formData: FormData) => Promise<void>;

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(date);
}

export function LeadFollowupPanel({ agenda, recordAction }: { agenda: LeadFollowupAgendaItem[]; recordAction: Action }) {
  const [selected, setSelected] = useState<LeadFollowupAgendaItem | null>(null);
  const [delay, setDelay] = useState(7);
  const completed = agenda.filter((lead) => lead.contactedToday).length;
  const target = agenda.length;
  const percentage = target === 0 ? 100 : Math.round((completed / target) * 100);
  const nextDate = useMemo(() => futureDate(delay), [delay, selected]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--border)] px-5 py-4">
        <div>
          <h2 className="erp-text-title-sm font-black">Leads para contactar hoy</h2>
          <p className="erp-text-body-sm mt-1 text-[color:var(--muted)]">Máximo 10 prospectos vencidos. Al contactarlos elegís cuándo deben reaparecer.</p>
        </div>
        <div className="grid h-20 w-20 place-items-center rounded-full p-1.5" style={{ background: `conic-gradient(var(--accent) ${percentage}%, #e6edf7 ${percentage}% 100%)` }}>
          <div className="grid h-full w-full place-items-center rounded-full bg-white text-center font-black tabular-nums">{completed}/{target}</div>
        </div>
      </div>
      {agenda.length === 0 ? (
        <p className="p-8 text-center erp-text-body-sm text-[color:var(--muted)]">No hay leads pendientes para hoy.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--border)]">
          {agenda.map((lead) => (
            <li className="grid gap-3 px-5 py-4 md:grid-cols-[1.5fr_1fr_auto] md:items-center" key={lead.id}>
              <div>
                <div className="font-bold">{lead.name}</div>
                <div className="erp-text-caption mt-1 text-[color:var(--muted)]">{lead.phone || "Sin teléfono"} · {lead.locality || "Sin zona"}</div>
              </div>
              <div className="erp-text-body-sm"><span className="block erp-text-caption text-[color:var(--muted)]">Programado</span>{lead.nextFollowup ?? "Sin fecha · pendiente"}</div>
              {lead.contactedToday ? (
                <span className="rounded-full bg-[color:var(--success-subtle)] px-3 py-2 text-center erp-text-body-sm font-bold text-[color:var(--success)]">Contactado</span>
              ) : (
                <Button onClick={() => { setDelay(7); setSelected(lead); }} size="sm" type="button">Contactado</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {selected ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <button aria-label="Cerrar" className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} type="button" />
          <Card className="relative z-10 w-full max-w-lg p-5">
            <h2 className="erp-text-title-sm font-black">Próximo contacto · {selected.name}</h2>
            <form action={recordAction} className="mt-4 grid gap-4" onSubmit={() => setSelected(null)}>
              <input name="id" type="hidden" value={selected.id} />
              <div>
                <div className="erp-text-body-sm mb-2 font-bold">Volver a recordar en</div>
                <div className="flex flex-wrap gap-2">
                  {[7, 14, 30, 60].map((days) => <Button key={days} onClick={() => setDelay(days)} size="sm" type="button" variant={delay === days ? "primary" : "secondary"}>{days} días</Button>)}
                </div>
              </div>
              <Field htmlFor="lead-next-contact" label="Fecha personalizada">
                <Input id="lead-next-contact" key={nextDate} min={futureDate(1)} name="nextFollowup" required type="date" defaultValue={nextDate} />
              </Field>
              <Field htmlFor="lead-contact-note" label="Nota del contacto">
                <Textarea id="lead-contact-note" maxLength={500} name="notes" placeholder="Qué respondió o qué quedó pendiente" rows={3} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setSelected(null)} size="sm" type="button" variant="secondary">Cancelar</Button>
                <Button size="sm" type="submit">Guardar y reprogramar</Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}
