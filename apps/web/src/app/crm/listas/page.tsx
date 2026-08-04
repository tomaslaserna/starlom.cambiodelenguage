import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Card, PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanUseCrm } from "@/lib/route-auth";

export default async function CrmListasPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  return (
    <ModulePage active="crm" description="Listas de precios en vivo para el vendedor." session={session} title="CRM · Listas de precios">
      <div className="grid gap-5">
        <PageHeader title="Listas de precios" description="Siempre la lista actualizada, lista para ver y descargar." />
        <Card className="p-8 text-center">
          <p className="erp-text-title-md font-semibold text-[color:var(--foreground)]">Proximamente</p>
          <p className="erp-text-body mx-auto mt-2 max-w-md text-[color:var(--muted)]">
            Aca vas a ver en vivo las listas de precios que Administracion publica, con su vigencia, para
            descargar en PDF. Lo construimos en la proxima etapa del CRM.
          </p>
        </Card>
      </div>
    </ModulePage>
  );
}
