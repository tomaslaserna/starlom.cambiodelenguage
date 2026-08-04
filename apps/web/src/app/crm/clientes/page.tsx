import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { PageHeader, StatCard } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorClients, getVendorProfile } from "@/lib/crm";
import { formatCurrency } from "@/lib/format";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { agendarClienteAction } from "@/app/crm/actions";
import { ClientesDashboard } from "@/app/crm/clientes/clientes-dashboard";

export default async function CrmClientesPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const [{ groups, counts, zonas }, profile] = await Promise.all([
    getVendorClients(session),
    getVendorProfile(session),
  ]);

  const enRiesgo = counts.riesgo ?? 0;
  const aRecontactar = counts.contactar ?? 0;

  return (
    <ModulePage
      active="crm"
      description="Tus clientes por estado, con zonas y recordatorios."
      session={session}
      title="CRM · Clientes"
    >
      <div className="grid gap-5">
        <PageHeader
          title={`Hola, ${profile.vendor || "vendedor"} 👋`}
          description={`Tenes ${enRiesgo} ${enRiesgo === 1 ? "cliente" : "clientes"} en riesgo y ${aRecontactar} para recontactar.`}
        />

        {/* Pantallazo de perfil (misma tira que el mockup) */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Clientes a cargo" value={profile.clientsInCharge} />
          <StatCard label="Clientes propios" value={profile.ownClients} />
          <StatCard label="Ventas del mes" value={formatCurrency(profile.monthSalesTotal)} />
          <StatCard
            label="Comision acumulada"
            value={formatCurrency(profile.accruedCommission)}
            detail={`${profile.commissionRate}%`}
          />
          <StatCard label="Cerradas (30 dias)" value={profile.closedSales30d} />
          <StatCard label="Presupuestos" value={profile.activeQuotes} />
        </div>

        <ClientesDashboard groups={groups} counts={counts} zonas={zonas} agendar={agendarClienteAction} />
      </div>
    </ModulePage>
  );
}
