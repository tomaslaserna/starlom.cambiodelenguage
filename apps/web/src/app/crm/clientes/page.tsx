import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorClients } from "@/lib/crm";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { agendarClienteAction } from "@/app/crm/actions";
import { ClientesDashboard } from "@/app/crm/clientes/clientes-dashboard";

export default async function CrmClientesPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const { groups, counts, zonas } = await getVendorClients(session);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <ModulePage
      active="crm"
      description="Tus clientes por estado, con zonas y recordatorios."
      session={session}
      title="CRM · Clientes"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Tus clientes"
          description={`${total} clientes a tu cargo o propios, clasificados por su ritmo de compra.`}
        />
        <ClientesDashboard groups={groups} counts={counts} zonas={zonas} agendar={agendarClienteAction} />
      </div>
    </ModulePage>
  );
}
