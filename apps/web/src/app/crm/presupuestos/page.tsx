import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorQuotes } from "@/lib/crm";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { PresupuestosDashboard } from "./presupuestos-dashboard";

export default async function CrmPresupuestosPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const { buckets, counts, topClients } = await getVendorQuotes(session);

  return (
    <ModulePage active="crm" description="Seguimiento de presupuestos del vendedor." session={session} title="CRM · Presupuestos">
      <div className="grid gap-5">
        <PageHeader title="Presupuestos" description="Vigentes, por vencer, vencidos y clientes que piden mucho." />
        <PresupuestosDashboard buckets={buckets} counts={counts} topClients={topClients} />
      </div>
    </ModulePage>
  );
}
