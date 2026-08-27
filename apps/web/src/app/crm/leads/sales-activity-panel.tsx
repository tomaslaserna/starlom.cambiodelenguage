"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import type { PlannedContact, SalesActivityDashboard, SalesActivityOutcome } from "@/lib/sales-activity";

type Action = (formData: FormData) => Promise<void>;

const OUTCOMES: Array<{ value: SalesActivityOutcome; label: string }> = [
  { value: "sin_respuesta", label: "No respondió" },
  { value: "contactado", label: "Contactado" },
  { value: "interesado", label: "Interesado" },
  { value: "pedido_probable", label: "Pedido probable" },
  { value: "recuperado", label: "Recuperado / volvió a comprar" },
  { value: "no_interesado", label: "No interesado" },
];

const BUCKET_LABEL = { contactar: "Próximo a recomprar", riesgo: "En riesgo", perdido: "A recuperar" };

function ProgressCircle({ completed, target, label }: { completed: number; target: number; label: string }) {
  const percentage = target === 0 ? 100 : Math.min(100, Math.round((completed / target) * 100));
  return (
    <div className="grid justify-items-center gap-2 text-center">
      <div
        className="grid h-24 w-24 place-items-center rounded-full p-2"
        style={{ background: `conic-gradient(var(--accent) ${percentage}%, #e6edf7 ${percentage}% 100%)` }}
      >
        <div className="grid h-full w-full place-items-center rounded-full bg-white">
          <div>
            <div className="text-xl font-black tabular-nums text-[color:var(--foreground)]">{completed}/{target}</div>
            <div className="erp-text-caption font-bold text-[color:var(--muted)]">{percentage}%</div>
          </div>
        </div>
      </div>
      <div className="erp-text-body-sm font-bold text-[color:var(--foreground)]">{label}</div>
    </div>
  );
}

export function SalesActivityPanel({ dashboard, recordAction }: { dashboard: SalesActivityDashboard; recordAction: Action }) {
  const [selected, setSelected] = useState<PlannedContact | null>(null);
  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="erp-text-title-sm font-black">Actividad comercial de hoy</h2>
            <p className="erp-text-body-sm mt-1 text-[color:var(--muted)]">Los círculos avanzan cuando registrás un contacto real.</p>
          </div>
          <div className="rounded-full bg-[color:var(--success-subtle)] px-3 py-1.5 erp-text-body-sm font-bold text-[color:var(--success)]">
            {dashboard.recoveredThisWeek} recuperados esta semana
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
          {dashboard.goals.map((goal) => (
            <ProgressCircle completed={goal.completed} key={goal.key} label={goal.label} target={goal.target} />
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[color:var(--border)] px-5 py-4">
          <h2 className="erp-text-title-sm font-black">Agenda sugerida</h2>
          <p className="erp-text-body-sm mt-1 text-[color:var(--muted)]">Hasta 8 clientes, equilibrados entre recompra próxima, riesgo y recuperación.</p>
        </div>
        {dashboard.planned.length === 0 ? (
          <p className="p-8 text-center erp-text-body-sm text-[color:var(--muted)]">Completaste la agenda sugerida de hoy.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {dashboard.planned.map((client) => (
              <li className="grid gap-3 px-5 py-4 lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-center" key={client.customerId}>
                <div>
                  <div className="font-bold text-[color:var(--foreground)]">{client.customerName}</div>
                  <div className="erp-text-caption mt-1 text-[color:var(--muted)]">{client.phone || "Sin teléfono"} · {client.zona}</div>
                </div>
                <div className="erp-text-body-sm"><span className="block erp-text-caption text-[color:var(--muted)]">Motivo</span>{BUCKET_LABEL[client.bucket]}</div>
                <div className="erp-text-body-sm tabular-nums"><span className="block erp-text-caption text-[color:var(--muted)]">Ritmo</span>Hace {client.daysSinceLastPurchase ?? "—"} días · promedio {client.averageDays ?? "—"}</div>
                {client.contactedToday ? (
                  <span className="rounded-full bg-[color:var(--success-subtle)] px-3 py-2 text-center erp-text-body-sm font-bold text-[color:var(--success)]">Completado</span>
                ) : (
                  <Button onClick={() => setSelected(client)} size="sm" type="button">Registrar contacto</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dashboard.todayActivities.length ? (
        <Card className="p-5">
          <h2 className="erp-text-title-sm font-black">Realizado hoy</h2>
          <ul className="mt-3 grid gap-2">
            {dashboard.todayActivities.map((activity) => (
              <li className="rounded-[9px] border border-[color:var(--border)] px-3 py-2 erp-text-body-sm" key={activity.id}>
                <b>{activity.customerName}</b> · {OUTCOMES.find((item) => item.value === activity.outcome)?.label ?? activity.outcome}
                {activity.nextFollowup ? ` · Próximo contacto ${activity.nextFollowup}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {selected ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <button aria-label="Cerrar" className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} type="button" />
          <Card className="relative z-10 w-full max-w-lg p-5">
            <h2 className="erp-text-title-sm font-black">Registrar contacto · {selected.customerName}</h2>
            <form action={recordAction} className="mt-4 grid gap-3" onSubmit={() => setSelected(null)}>
              <input name="customerId" type="hidden" value={selected.customerId} />
              <input name="bucket" type="hidden" value={selected.bucket} />
              <Field htmlFor="activity-outcome" label="Resultado">
                <Select defaultValue="contactado" id="activity-outcome" name="outcome" required>
                  {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </Select>
              </Field>
              <Field htmlFor="activity-next" label="Próximo contacto">
                <Input id="activity-next" name="nextFollowup" type="date" />
              </Field>
              <Field htmlFor="activity-notes" label="Nota">
                <Textarea id="activity-notes" maxLength={500} name="notes" placeholder="Qué respondió y cuál es el próximo paso" rows={3} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setSelected(null)} size="sm" type="button" variant="secondary">Cancelar</Button>
                <Button size="sm" type="submit">Guardar actividad</Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
