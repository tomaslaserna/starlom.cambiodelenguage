import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { AppIcon, ButtonLink, Card, PageHeader, StatCard } from "@/components/ui";
import { normalizeRole, requireStaffSession } from "@/lib/auth";
import { getVendorClients, getVendorOpenAccounts, getVendorProfile } from "@/lib/crm";
import { getLeadFollowupAgenda } from "@/lib/leads";
import { getSalesActivityDashboard } from "@/lib/sales-activity";
import { formatCurrency } from "@/lib/format";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { agendarClienteAction } from "@/app/crm/actions";
import { ClientesDashboard } from "@/app/crm/clientes/clientes-dashboard";

export default async function CrmPerfilPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");
  const isSeller = normalizeRole(session.role) === "vendedor";

  const [profile, clients, openAccounts, leadAgenda] = await Promise.all([
    getVendorProfile(session),
    getVendorClients(session),
    getVendorOpenAccounts(session),
    getLeadFollowupAgenda(session),
  ]);
  const { groups, counts, zonas } = clients;
  const activity = isSeller ? await getSalesActivityDashboard(session, clients) : null;
  const pendingCustomerContacts = activity?.planned.filter((client) => !client.contactedToday).length ?? 0;
  const pendingLeadContacts = leadAgenda.filter((lead) => !lead.contactedToday).length;
  const contactsToday = pendingCustomerContacts + pendingLeadContacts;
  const accountsToCollect = openAccounts.accounts.filter((account) => account.balance > 0.005).length;
  const goalProgress = profile.goalSales > 0 ? Math.min(100, Math.round((profile.monthSalesTotal / profile.goalSales) * 100)) : 0;

  return (
    <ModulePage
      active="crm"
      description="Tu escritorio comercial de ventas, clientes y tareas."
      session={session}
      title="CRM · Inicio"
    >
      <div className="grid gap-5">
        <PageHeader
          title={`Hola, ${profile.vendor || "vendedor"}`}
          description="Este es tu tablero comercial para comenzar el día."
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<AppIcon name="trend" />}
            label="Ventas vs meta"
            value={`${goalProgress}%`}
            detail={profile.goalSales > 0 ? `${formatCurrency(profile.monthSalesTotal)} de ${formatCurrency(profile.goalSales)}` : `${formatCurrency(profile.monthSalesTotal)} · meta sin configurar`}
            tone={profile.goalSales > 0 && profile.monthSalesTotal >= profile.goalSales ? "success" : "accent"}
          />
          <StatCard icon={<AppIcon name="quote" />} label="Presupuestos a revisar" value={profile.activeQuotes} detail="Pendientes vigentes o por definir" tone="warning" />
          <StatCard icon={<AppIcon name="wallet" />} label="Clientes a cobrar" value={accountsToCollect} detail="Con saldo deudor abierto" tone={accountsToCollect > 0 ? "danger" : "success"} />
          <StatCard icon={<AppIcon name="clock" />} label="Contactos pendientes hoy" value={contactsToday} detail={`${pendingCustomerContacts} clientes · ${pendingLeadContacts} leads`} tone={contactsToday > 0 ? "accent" : "success"} />
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
            <h2 className="erp-text-title-sm font-black">Acciones rápidas</h2>
            <ButtonLink href="/crm/leads" variant="secondary">Contactar clientes y leads</ButtonLink>
            <ButtonLink href="/crm/cobros" variant="secondary">Revisar cobranzas</ButtonLink>
            <ButtonLink href="/crm/presupuestos" variant="secondary">Revisar presupuestos</ButtonLink>
            <ButtonLink href="/crm/presupuestos/nuevo" variant="secondary">Crear presupuesto</ButtonLink>
          </Card>
        </div>

        {/* Seguimiento de clientes por estado */}
        <div>
          <PageHeader
            title="Seguimiento de clientes"
            description="Tus clientes propios y a cargo agrupados por estado. Agenda a los que hay que recontactar."
          />
          <div className="mt-4">
            <ClientesDashboard groups={groups} counts={counts} zonas={zonas} agendar={agendarClienteAction} />
          </div>
        </div>
      </div>
    </ModulePage>
  );
}
