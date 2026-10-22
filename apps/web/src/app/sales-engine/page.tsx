import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { AppIcon, ButtonLink, Card, PageHeader, StatCard } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorClients, getVendorProfile, getVendorQuotes } from "@/lib/crm";
import { buildCrmMissions } from "@/lib/crm-missions";
import { getLeadFollowupAgenda } from "@/lib/leads";
import { formatCurrency } from "@/lib/format";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { getPriceListFollowupSignals } from "@/lib/price-list-followups";
import { getSalesMissionStates } from "@/lib/sales-missions";
import { localDateIso } from "@/lib/timezone";
import { DailyMissions } from "./daily-missions";

function daysFromToday(days: number) {
  const date = new Date(`${localDateIso()}T12:00:00-03:00`);
  date.setDate(date.getDate() + days);
  return localDateIso(date);
}

export default async function SalesEnginePage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");
  const [profile, clients, leadAgenda, quotes, priceListSignals, missionStates] = await Promise.all([
    getVendorProfile(session),
    getVendorClients(session),
    getLeadFollowupAgenda(session),
    getVendorQuotes(session),
    getPriceListFollowupSignals(session),
    getSalesMissionStates(session),
  ]);
  const missions = buildCrmMissions({ clients, leads: leadAgenda, quotes: quotes.buckets, priceListSignals, missionStates });
  const urgentMissions = missions.filter((mission) => mission.urgency === "ahora").length;
  const recontacts = missions.filter((mission) => mission.kind === "lead" || mission.kind === "cliente" || mission.kind === "lista").length;
  const quoteMissions = missions.filter((mission) => mission.kind === "presupuesto").length;
  const riskClients = (clients.counts.riesgo ?? 0) + (clients.counts.perdido ?? 0);
  return (
    <ModulePage active="sales-engine" description="Intervenciones comerciales sugeridas a partir de señales reales." session={session} title="Motor de ventas">
      <div className="grid gap-5">
        <PageHeader actions={<ButtonLink href="/quotes/new" leadingIcon={<AppIcon className="h-4 w-4" name="quote" />}>Nuevo presupuesto</ButtonLink>} title={`Qué conviene hacer hoy, ${profile.vendor || "equipo"}`} description="El sistema detecta señales; ustedes deciden y actúan. Sin duplicar conversaciones ni cargar actividad innecesaria." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<AppIcon name="warning" />} label="Prioridad inmediata" value={urgentMissions} detail="Intervenciones que conviene resolver primero" tone={urgentMissions > 0 ? "danger" : "success"} />
          <StatCard icon={<AppIcon name="clock" />} label="Recontactos sugeridos" value={recontacts} detail="Prospectos, listas enviadas y clientes fuera de ritmo" tone="accent" />
          <StatCard icon={<AppIcon name="quote" />} label="Presupuestos accionables" value={quoteMissions} detail="Próximos a vencer o pendientes de resolución" tone="warning" />
          <StatCard icon={<AppIcon name="trend" />} label="Cartera en observación" value={riskClients} detail={`${formatCurrency(profile.monthSalesTotal)} vendidos este mes`} tone={riskClients > 0 ? "warning" : "success"} />
        </div>
        <DailyMissions defaultNextFollowupOn={daysFromToday(7)} minFollowupOn={localDateIso()} missions={missions} />
        <Card className="grid gap-3 p-5">
          <div><h2 className="text-base font-black text-[#0f172a]">Cómo decide el motor</h2><p className="mt-1 text-sm text-[#64748b]">Cada misión necesita una señal, una ventana temporal y una acción posible.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-[#f8fafc] p-4"><strong className="text-sm text-[#0f172a]">Seguimiento pendiente</strong><p className="mt-1 text-xs leading-relaxed text-[#64748b]">Un prospecto aparece únicamente cuando llega su próxima fecha. Si se registra el contacto, deja de aparecer hasta el siguiente ciclo.</p></div>
            <div className="rounded-xl bg-[#f8fafc] p-4"><strong className="text-sm text-[#0f172a]">Ritmo de recompra</strong><p className="mt-1 text-xs leading-relaxed text-[#64748b]">Se compara el tiempo desde la última compra con la frecuencia histórica de cada cliente.</p></div>
            <div className="rounded-xl bg-[#f8fafc] p-4"><strong className="text-sm text-[#0f172a]">Presupuesto accionable</strong><p className="mt-1 text-xs leading-relaxed text-[#64748b]">Los nuevos vencimientos permanecen hasta que el operador los resuelve; el archivo histórico anterior no se reactiva.</p></div>
            <div className="rounded-xl bg-[#f8fafc] p-4"><strong className="text-sm text-[#0f172a]">Lista compartida</strong><p className="mt-1 text-xs leading-relaxed text-[#64748b]">Al generar el PDF se registra destinatario, motivo y fecha de revisión. No hace falta volver a cargar el prospecto.</p></div>
          </div>
        </Card>
      </div>
    </ModulePage>
  );
}
