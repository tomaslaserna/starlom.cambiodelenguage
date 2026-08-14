import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorClients, getVendorProfile } from "@/lib/crm";
import { formatCurrency } from "@/lib/format";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { agendarClienteAction } from "@/app/crm/actions";
import { ClientesDashboard } from "@/app/crm/clientes/clientes-dashboard";

export default async function CrmPerfilPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const [profile, { groups, counts, zonas }] = await Promise.all([
    getVendorProfile(session),
    getVendorClients(session),
  ]);

  return (
    <ModulePage
      active="crm"
      description="Tu perfil de vendedor: clientes, ventas y comision."
      session={session}
      title="CRM · Perfil"
    >
      <div className="grid gap-5">
        <PageHeader
          title={`Hola, ${profile.vendor || "vendedor"}`}
          description="Un pantallazo de tus numeros como vendedor."
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Clientes a cargo" value={profile.clientsInCharge} />
          <StatCard label="Clientes propios" value={profile.ownClients} />
          <StatCard
            label="Ventas del mes"
            value={formatCurrency(profile.monthSalesTotal)}
            detail={`${profile.monthSalesCount} ventas`}
          />
          <StatCard
            label="Comision acumulada"
            value={formatCurrency(profile.accruedCommission)}
            detail={`${profile.commissionRate}% · ultimos 30 dias`}
          />
          <StatCard label="Ventas cerradas (30 dias)" value={profile.closedSales30d} />
          <StatCard label="Presupuestos vigentes" value={profile.activeQuotes} />
        </div>

        <Card className="p-5">
          <p className="erp-text-body text-[color:var(--muted)]">
            Tu comision se calcula sobre tus ventas entregadas de los ultimos 30 dias, segun el porcentaje
            que Administracion te asigna en Gestion de vendedores. Cuando actualicen tu porcentaje o cierres
            nuevas ventas, este numero se actualiza solo.
          </p>
        </Card>

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
