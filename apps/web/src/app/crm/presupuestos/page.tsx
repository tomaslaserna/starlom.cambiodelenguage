import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Field, Input, PageHeader, Toolbar } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorQuotes } from "@/lib/crm";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { PresupuestosDashboard } from "./presupuestos-dashboard";

type CrmPresupuestosPageProps = {
  searchParams: Promise<{ q?: string; created?: string }>;
};

export default async function CrmPresupuestosPage({ searchParams }: CrmPresupuestosPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const params = await searchParams;
  const query = params.q?.trim().toLocaleLowerCase("es") ?? "";
  const { buckets: rawBuckets, topClients } = await getVendorQuotes(session);
  const buckets = Object.fromEntries(
    Object.entries(rawBuckets).map(([key, quotes]) => [
      key,
      quotes.filter((quote) =>
        `${quote.quoteNumber} ${quote.clientName}`.toLocaleLowerCase("es").includes(query),
      ),
    ]),
  ) as typeof rawBuckets;
  const counts = {
    vigentes: buckets.vigentes.length,
    por_vencer: buckets.por_vencer.length,
    vencidos: buckets.vencidos.length,
    aceptados: buckets.aceptados.length,
  };

  return (
    <ModulePage active="crm" description="Seguimiento de presupuestos del vendedor." session={session} title="CRM · Presupuestos">
      <div className="grid gap-5">
        <PageHeader
          actions={<ButtonLink href="/crm/presupuestos/nuevo">Nuevo presupuesto</ButtonLink>}
          title="Presupuestos"
          description="Consulta los presupuestos realizados y crea uno nuevo cuando lo necesites."
        />
        {params.created ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Presupuesto creado correctamente.
          </div>
        ) : null}
        <Toolbar ariaLabel="Buscar presupuestos del CRM">
          <form action="/crm/presupuestos" className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="min-w-0 flex-1" htmlFor="crm-quotes-query" label="Buscar">
              <Input
                defaultValue={params.q ?? ""}
                id="crm-quotes-query"
                name="q"
                placeholder="Número de presupuesto o cliente"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>
        <PresupuestosDashboard buckets={buckets} counts={counts} topClients={topClients} />
      </div>
    </ModulePage>
  );
}
