import Link from "next/link";
import { AppIcon, Button, ButtonLink, Card, cn } from "@/components/ui";
import type { AppIconName } from "@/components/ui/app-icon";
import type { CrmMission, CrmMissionKind, CrmMissionUrgency } from "@/lib/crm-missions";
import { completeSalesMissionAction } from "./actions";

const KIND_META: Record<CrmMissionKind, { label: string; icon: AppIconName; explanation: string }> = {
  lead: { label: "Prospectos", icon: "trend", explanation: "Contactos cuya fecha de seguimiento llegó y todavía no fueron atendidos." },
  cliente: { label: "Recompra", icon: "user", explanation: "Clientes que se alejaron de su ritmo real de compra." },
  presupuesto: { label: "Presupuestos", icon: "quote", explanation: "Propuestas próximas a vencer o vencidas que todavía esperan una decisión." },
  lista: { label: "Listas enviadas", icon: "download", explanation: "Listas compartidas cuyo plazo de seguimiento llegó hoy." },
};

const URGENCY_META: Record<CrmMissionUrgency, { label: string; classes: string }> = {
  ahora: { label: "Prioridad alta", classes: "bg-[#fff0ef] text-[#b42318]" },
  hoy: { label: "Para hoy", classes: "bg-[#fff7e5] text-[#9a6700]" },
  proximo: { label: "Próximo paso", classes: "bg-[#edf5ff] text-[#075ac7]" },
};

export function DailyMissions({ missions, defaultNextFollowupOn, minFollowupOn }: { missions: CrmMission[]; defaultNextFollowupOn: string; minFollowupOn: string }) {
  const urgent = missions.filter((mission) => mission.urgency === "ahora").length;
  const breakdown = (Object.keys(KIND_META) as CrmMissionKind[]).map((kind) => ({ kind, count: missions.filter((mission) => mission.kind === kind).length, ...KIND_META[kind] }));

  return (
    <div className="grid gap-4">
      <section aria-label="Composición de las misiones" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {breakdown.map((item) => (
          <Card className="p-4" key={item.kind}>
            <div className="flex items-center justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#edf5ff] text-[#075ac7]"><AppIcon className="h-4 w-4" name={item.icon} /></span><strong className="text-2xl font-black tabular-nums text-[#0f172a]">{item.count}</strong></div>
            <h2 className="mt-3 text-sm font-extrabold text-[#0f172a]">{item.label}</h2>
            <p className="mt-1 text-xs font-medium leading-relaxed text-[#64748b]">{item.explanation}</p>
          </Card>
        ))}
      </section>
      <Card className="overflow-hidden border-[#bcd8fa] shadow-[0_18px_44px_rgba(7,90,199,0.10)]">
        <div className="flex flex-col gap-4 border-b border-[#dce8f7] bg-[linear-gradient(120deg,#075ac7_0%,#0b70df_58%,#1687e8_100%)] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-blue-100"><span className="h-2 w-2 animate-pulse rounded-full bg-[#ffbf47]" />Motor de ventas</div><h2 className="mt-2 text-2xl font-black tracking-[-0.025em]">Misiones de hoy</h2><p className="mt-1 max-w-2xl text-sm font-medium text-blue-50">Cada misión permanece hasta marcarla como realizada. Al cerrarla elegís cuándo debe volver a aparecer.</p></div>
          <div className="rounded-[14px] border border-white/25 bg-white/12 px-4 py-3 text-center backdrop-blur-sm"><div className="text-2xl font-black tabular-nums">{missions.length}</div><div className="text-xs font-bold text-blue-100">misiones · {urgent} urgentes</div></div>
        </div>
        {missions.length ? (
          <ol className="divide-y divide-[#e4ebf4]">
            {missions.map((mission, index) => {
              const kind = KIND_META[mission.kind];
              const urgency = URGENCY_META[mission.urgency];
              return (
                <li className="grid gap-3 px-4 py-4 transition hover:bg-[#f8fbff] sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:items-center sm:px-5 xl:grid-cols-[2.25rem_minmax(0,1fr)_minmax(22rem,auto)]" key={mission.id}>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#edf5ff] text-sm font-black text-[#075ac7]">{index + 1}</span>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={cn("rounded-full px-2 py-1 text-[11px] font-extrabold", urgency.classes)}>{urgency.label}</span><span className="inline-flex items-center gap-1 text-xs font-bold text-[#64748b]"><AppIcon className="h-3.5 w-3.5" name={kind.icon} />{kind.label}</span>{mission.completedBefore ? <span className="rounded-full bg-[#e8f8f0] px-2 py-1 text-[11px] font-extrabold text-[#087a55]">Seguimiento recurrente</span> : null}</div><h3 className="mt-2 text-base font-extrabold text-[#0f172a]">{mission.title}</h3><p className="mt-0.5 text-sm font-semibold text-[#475569]">{mission.reason}</p><p className="mt-0.5 text-xs font-medium text-[#7a8798]">{mission.detail}</p></div>
                  <div className="grid gap-2 sm:col-start-2 xl:col-start-auto">
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                    {mission.phone ? <ButtonLink href={`https://wa.me/${mission.phone}`} rel="noreferrer" size="sm" target="_blank" variant="secondary">WhatsApp</ButtonLink> : null}
                    <ButtonLink href={mission.href} size="sm" variant="secondary">{mission.actionLabel}</ButtonLink>
                    </div>
                    <form action={completeSalesMissionAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-[#cfe0f4] bg-[#f8fbff] p-2.5">
                      <input name="missionKey" type="hidden" value={mission.id} />
                      <input name="kind" type="hidden" value={mission.kind} />
                      <input name="entityId" type="hidden" value={mission.entityId} />
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-white px-3 text-sm font-extrabold text-[#0f172a] shadow-sm">
                        <input className="h-4 w-4 accent-[#087a55]" name="completed" required type="checkbox" value="yes" />
                        Realizada
                      </label>
                      <label className="grid gap-1 text-[11px] font-bold text-[#64748b]">
                        Volver a sugerir
                        <input className="h-9 rounded-lg border border-[#cbd8e8] bg-white px-2 text-sm font-bold text-[#0f172a]" defaultValue={defaultNextFollowupOn} min={minFollowupOn} name="nextFollowupOn" required type="date" />
                      </label>
                      <Button size="sm" type="submit">Guardar</Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <div className="grid place-items-center gap-2 px-6 py-12 text-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#e8f8f0] text-[#087a55]"><AppIcon name="chart" /></span><strong className="text-lg text-[#0f172a]">Todo al día</strong><p className="max-w-md text-sm text-[#64748b]">No hay intervenciones justificadas para hoy. El motor volverá a revisar seguimientos y ritmos de compra.</p><Link className="mt-2 text-sm font-extrabold text-[#075ac7] hover:underline" href="/customers">Consultar clientes</Link></div>}
      </Card>
    </div>
  );
}
