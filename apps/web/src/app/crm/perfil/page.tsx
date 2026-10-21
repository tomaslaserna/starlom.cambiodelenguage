import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { AppIcon, ButtonLink, Card, PageHeader, StatCard } from "@/components/ui";
import { normalizeRole, requireStaffSession } from "@/lib/auth";
import { getVendorClients, getVendorOpenAccounts, getVendorProfile, getVendorQuotes } from "@/lib/crm";
import { buildCrmMissions } from "@/lib/crm-missions";
import { getLeadFollowupAgenda } from "@/lib/leads";
import { getSalesActivityDashboard } from "@/lib/sales-activity";
import { formatCurrency } from "@/lib/format";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { agendarClienteAction } from "@/app/crm/actions";
import { ClientesDashboard } from "@/app/crm/clientes/clientes-dashboard";
import { CrmDailyMissions } from "./crm-daily-missions";

export default async function CrmPerfilPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");
  const isSeller = normalizeRole(session.role) === "vendedor";
  const [profile, clients, openAccounts, leadAgenda, quotes] = await Promise.all([
    getVendorProfile(session),
    getVendorClients(session),
    getVendorOpenAccounts(session),
    getLeadFollowupAgenda(session),
    getVendorQuotes(session),
  ]);
  const activity = isSeller ? await getSalesActivityDashboard(session, clients) : null;
  const { counts, zonas } = clients;
  const missions = buildCrmMissions({ clients, leads: leadAgenda, quotes: quotes.buckets, accounts: openAccounts.accounts });
  const urgentMissions = missions.filter((mission) => mission.urgency === "ahora").length;
  const accountsToCollect = openAccounts.accounts.filter((account) => account.balance > 0.005).length;
  const goalProgress = profile.goalSales > 0 ? Math.min(100, Math.round((profile.monthSalesTotal / profile.goalSales) * 100)) : 0;

  return (
    <ModulePage
      active="crm"
      description="Prioridades, oportunidades y próximos pasos en un solo lugar."
      session={session}
      title="CRM · Hoy"
    >
      <div className="grid gap-5">
        <PageHeader
          actions={<ButtonLink href="/crm/leads?nuevo=1" leadingIcon={<AppIcon className="h-4 w-4" name="trend" />}>Cargar lead</ButtonLink>}
          title={`Buen día, ${profile.vendor || "equipo comercial"}`}
          description="LA TIRRA revisó la actividad comercial y ordenó lo que conviene resolver primero."
        />

        <CrmDailyMissions missions={missions} />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<AppIcon name="trend" />}
            label="Ventas vs meta"
            value={`${goalProgress}%`}
            detail={profile.goalSales > 0 ? `${formatCurrency(profile.monthSalesTotal)} de ${formatCurrency(profile.goalSales)}` : `${formatCurrency(profile.monthSalesTotal)} · meta sin configurar`}
            tone={profile.goalSales > 0 && profile.monthSalesTotal >= profile.goalSales ? "success" : "accent"}
          />
          <StatCard icon={<AppIcon name="warning" />} label="Prioridad inmediata" value={urgentMissions} detail={`${activity?.todayActivities.length ?? 0} contactos registrados hoy`} tone={urgentMissions > 0 ? "danger" : "success"} />
          <StatCard icon={<AppIcon name="wallet" />} label="Clientes a cobrar" value={accountsToCollect} detail="Con saldo deudor abierto" tone={accountsToCollect > 0 ? "danger" : "success"} />
          <StatCard icon={<AppIcon name="quote" />} label="Oportunidades abiertas" value={quotes.counts.vigentes + quotes.counts.por_vencer + quotes.counts.vencidos} detail={`${quotes.counts.por_vencer} por vencer · ${quotes.counts.vencidos} vencidas`} tone="warning" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-[color:var(--border)] px-5 py-4">
              <h2 className="erp-text-title-sm font-black">Top 5 clientes del mes</h2>
              <p className="erp-text-caption mt-1 text-[color:var(--muted)]">Ordenados por ventas entregadas del mes actual.</p>
            </div>
            {profile.topClients.length ? (
              <ol className="divide-y divide-[color:var(--border)]">
                {profile.topClients.map((client, index) => (
                  <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3" key={`${client.clientId}-${client.name}`}>
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--accent-subtle)] font-black text-[color:var(--accent-strong)]">{index + 1}</span>
                    <div className="min-w-0"><div className="truncate font-bold">{client.name}</div><div className="erp-text-caption text-[color:var(--muted)]">{client.salesCount} ventas</div></div>
                    <strong className="whitespace-nowrap font-mono tabular-nums">{formatCurrency(client.total)}</strong>
                  </li>
                ))}
              </ol>
            ) : <p className="p-6 text-center erp-text-body-sm text-[color:var(--muted)]">Todavía no hay ventas entregadas este mes.</p>}
          </Card>
          <Card className="grid content-start gap-3 p-5">
            <div><h2 className="erp-text-title-sm font-black">Carga rápida</h2><p className="mt-1 text-sm text-[color:var(--muted)]">Un dato entra una sola vez y desde acá sigue su proceso.</p></div>
            <ButtonLink href="/crm/leads?nuevo=1" leadingIcon={<AppIcon className="h-4 w-4" name="trend" />}>Nuevo lead</ButtonLink>
            <ButtonLink href="/crm/clientes/nuevo" leadingIcon={<AppIcon className="h-4 w-4" name="user" />} variant="secondary">Nuevo cliente</ButtonLink>
            <ButtonLink href="/crm/presupuestos/nuevo" leadingIcon={<AppIcon className="h-4 w-4" name="quote" />} variant="secondary">Nuevo presupuesto</ButtonLink>
            <ButtonLink href="/crm/cobros" leadingIcon={<AppIcon className="h-4 w-4" name="wallet" />} variant="secondary">Registrar cobro</ButtonLink>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[color:var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="erp-text-title-sm font-black">Libro abierto de clientes</h2><p className="mt-1 text-sm text-[color:var(--muted)]">Estado de toda la cartera, sin recorrer pantallas.</p></div><ButtonLink href="/crm/clientes" size="sm" variant="secondary">Abrir cartera</ButtonLink></div>
          <div className="grid gap-px bg-[color:var(--border)] sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Al día", counts.al_dia ?? 0, "text-[#087a55]"],
              ["Contactar", counts.contactar ?? 0, "text-[#075ac7]"],
              ["En riesgo", counts.riesgo ?? 0, "text-[#a15c00]"],
              ["A recuperar", counts.perdido ?? 0, "text-[#b42318]"],
              ["Sin historial", counts.sin_historial ?? 0, "text-[#64748b]"],
            ].map(([label, value, color]) => <div className="bg-white p-4" key={String(label)}><div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div><div className="mt-1 text-sm font-bold text-[#475569]">{label}</div></div>)}
          </div>
          <div className="border-t border-[color:var(--border)] px-5 py-3 text-xs font-semibold text-[color:var(--muted)]">{zonas.length} zonas activas · {profile.clientsInCharge} clientes en cartera</div>
        </Card>

        <details className="rounded-[16px] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-xs)]">
          <summary className="cursor-pointer font-extrabold text-[#0f172a]">Ver análisis completo de seguimiento</summary>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Explorá toda la cartera por estado, zona y ritmo de recompra.</p>
          <div className="mt-4"><ClientesDashboard groups={clients.groups} counts={counts} zonas={zonas} agendar={agendarClienteAction} /></div>
        </details>
      </div>
    </ModulePage>
  );
}
