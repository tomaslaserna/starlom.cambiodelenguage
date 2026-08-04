import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Card, PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanUseCrm } from "@/lib/route-auth";

export default async function CrmPresupuestosPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  return (
    <ModulePage active="crm" description="Seguimiento de presupuestos del vendedor." session={session} title="CRM · Presupuestos">
      <div className="grid gap-5">
        <PageHeader title="Presupuestos" description="Vigentes, vencidos y clientes que piden mucho presupuesto." />
        <Card className="p-8 text-center">
          <p className="erp-text-title-md font-semibold text-[color:var(--foreground)]">Proximamente</p>
          <p className="erp-text-body mx-auto mt-2 max-w-md text-[color:var(--muted)]">
            Aca vas a poder trackear tus presupuestos vigentes y vencidos, y las listas de precios que enviaste.
            Lo construimos en la proxima etapa del CRM.
          </p>
        </Card>
      </div>
    </ModulePage>
  );
}
