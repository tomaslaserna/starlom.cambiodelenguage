import { ModulePage } from "@/components/module-page";
import { SectionTabs } from "@/components/section-tabs";
import {
  ButtonLink,
  Card,
  CardContent,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { getSalesSummary } from "@/lib/sales-admin";
import { requireStaffSession } from "@/lib/auth";

export default async function SalesPage() {
  const session = await requireStaffSession();
  const summary = await getSalesSummary(session.companyId, "mes");

  return (
    <ModulePage
      active="sales"
      description="Ventas registradas, carga de pedidos y presupuestos como submodulos comerciales."
      session={session}
      title="Ventas"
    >
      <div className="grid gap-5">
        <PageHeader
          actions={
            <ButtonLink aria-label="Cargar nuevo pedido desde ventas" href="/orders/new">
              Cargar pedido
            </ButtonLink>
          }
          description="Resumen comercial y accesos operativos a ventas registradas, carga de pedidos y presupuestos."
          title="Ventas"
        />

        <SectionTabs
          tabs={[
            { href: "/sales", label: "Ventas registradas", active: true },
            { href: "/orders/new", label: "Cargar pedido" },
            { href: "/quotes", label: "Presupuestos" },
          ]}
        />

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard className="p-3" label="Comprobantes" value={summary.totalInvoices} />
          <StatCard className="p-3" label="Monto vendido" value={formatCurrency(summary.totalAmount)} />
          <StatCard className="p-3" label="Facturado" value={formatCurrency(summary.invoiced)} />
          <StatCard className="p-3" label="Pendiente de cobro" value={formatCurrency(summary.pending)} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="grid h-full gap-4">
              <div>
                <h2 className="font-semibold">Ventas registradas</h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Listado operativo de pedidos y ventas.
                </p>
              </div>
              <ButtonLink className="w-fit" href="/orders/new" size="sm" variant="secondary">
                Abrir
              </ButtonLink>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid h-full gap-4">
              <div>
                <h2 className="font-semibold">Cargar pedido</h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Alta y seguimiento de pedidos desde el modulo Pedidos.
                </p>
              </div>
              <ButtonLink className="w-fit" href="/orders" size="sm" variant="secondary">
                Abrir
              </ButtonLink>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid h-full gap-4">
              <div>
                <h2 className="font-semibold">Presupuestos</h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Cotizaciones, vencimientos y aceptacion.
                </p>
              </div>
              <ButtonLink className="w-fit" href="/quotes" size="sm" variant="secondary">
                Abrir
              </ButtonLink>
            </CardContent>
          </Card>
        </div>
      </div>
    </ModulePage>
  );
}
