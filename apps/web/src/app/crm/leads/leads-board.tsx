"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import type { Lead } from "@/lib/leads-domain";

type Action = (formData: FormData) => Promise<void>;

type LeadsBoardProps = {
  active: Record<string, Lead[]>;
  closed: Lead[];
  counts: Record<string, number>;
  createAction: Action;
  moveAction: Action;
  discardAction: Action;
  convertAction: Action;
};

const COLUMNS: { key: string; label: string }[] = [
  { key: "nuevo", label: "Nuevo" },
  { key: "contactado", label: "Contactado" },
  { key: "interesado", label: "Interesado" },
];

const NEXT_STAGE: Record<string, string> = { nuevo: "contactado", contactado: "interesado" };

function followupTone(date: string | null): string {
  if (!date) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "border-[color:var(--danger)] text-[color:var(--danger)]";
  if (days <= 3) return "border-[color:var(--warning)] text-[color:var(--warning)]";
  return "border-[color:var(--border)] text-[color:var(--muted)]";
}

export function LeadsBoard({
  active,
  closed,
  counts,
  createAction,
  moveAction,
  discardAction,
  convertAction,
}: LeadsBoardProps) {
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <p className="erp-text-body-sm text-[color:var(--muted)]">
          {counts.nuevo + counts.contactado + counts.interesado} leads activos ·{" "}
          {counts.convertido} convertidos · {counts.descartado} descartados
        </p>
        <Button onClick={() => setCreating(true)} size="sm" type="button">
          + Nuevo lead
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <div
            className="grid content-start gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-3"
            key={column.key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const id = event.dataTransfer.getData("text/lead-id");
              if (!id) return;
              const formData = new FormData();
              formData.set("id", id);
              formData.set("stage", column.key);
              void moveAction(formData);
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="erp-text-body-sm font-black">{column.label}</h2>
              <span className="erp-text-caption text-[color:var(--muted)]">{active[column.key]?.length ?? 0}</span>
            </div>
            {(active[column.key] ?? []).map((lead) => (
              <article
                className="grid gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] p-3"
                draggable
                key={lead.id}
                onDragStart={(event) => event.dataTransfer.setData("text/lead-id", lead.id)}
              >
                <div className="font-bold">{lead.name}</div>
                <div className="erp-text-caption text-[color:var(--muted)]">
                  {[lead.locality, lead.phone].filter(Boolean).join(" · ") || "Sin datos"}
                </div>
                {lead.nextFollowup ? (
                  <span className={`w-fit rounded-full border px-2 py-0.5 text-xs font-semibold ${followupTone(lead.nextFollowup)}`}>
                    Seguir: {lead.nextFollowup}
                  </span>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {NEXT_STAGE[lead.stage] ? (
                    <form action={moveAction}>
                      <input name="id" type="hidden" value={lead.id} />
                      <input name="stage" type="hidden" value={NEXT_STAGE[lead.stage]} />
                      <Button size="sm" type="submit" variant="secondary">
                        → {NEXT_STAGE[lead.stage]}
                      </Button>
                    </form>
                  ) : null}
                  <form action={convertAction}>
                    <input name="id" type="hidden" value={lead.id} />
                    <Button size="sm" type="submit">Convertir</Button>
                  </form>
                  <form action={discardAction}>
                    <input name="id" type="hidden" value={lead.id} />
                    <Button size="sm" type="submit" variant="secondary">Descartar</Button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>

      <div>
        <button
          className="erp-text-body-sm font-semibold text-[color:var(--muted)]"
          onClick={() => setShowClosed((value) => !value)}
          type="button"
        >
          {showClosed ? "▾" : "▸"} Cerrados ({closed.length})
        </button>
        {showClosed ? (
          <ul className="mt-2 grid gap-2">
            {closed.map((lead) => (
              <li className="flex items-center justify-between rounded-md border border-[color:var(--border)] p-2" key={lead.id}>
                <span>{lead.name} · {lead.locality || "Sin zona"}</span>
                <span className="erp-text-caption text-[color:var(--muted)]">
                  {lead.stage === "convertido" ? "Convertido" : "Descartado"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {creating ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <button
            aria-label="Cerrar"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => setCreating(false)}
            type="button"
          />
          <div className="relative z-10 w-full max-w-md rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <h2 className="erp-text-title-sm font-black">Nuevo lead</h2>
            <form action={createAction} className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={() => setCreating(false)}>
              <Field htmlFor="lead-name" label="Nombre">
                <Input id="lead-name" name="name" required />
              </Field>
              <Field htmlFor="lead-phone" label="Teléfono">
                <Input id="lead-phone" name="phone" />
              </Field>
              <Field htmlFor="lead-locality" label="Zona / localidad">
                <Input id="lead-locality" name="locality" />
              </Field>
              <Field htmlFor="lead-source" label="Origen">
                <Input id="lead-source" name="source" placeholder="Recomendado, feria, etc." />
              </Field>
              <Field htmlFor="lead-email" label="Email">
                <Input id="lead-email" name="email" type="email" />
              </Field>
              <Field htmlFor="lead-followup" label="Próximo seguimiento">
                <Input id="lead-followup" name="nextFollowup" type="date" />
              </Field>
              <div className="sm:col-span-2">
                <Field htmlFor="lead-notes" label="Notas">
                  <Input id="lead-notes" name="notes" placeholder="Opcional" />
                </Field>
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button onClick={() => setCreating(false)} size="sm" type="button" variant="secondary">Cancelar</Button>
                <Button size="sm" type="submit">Crear lead</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
