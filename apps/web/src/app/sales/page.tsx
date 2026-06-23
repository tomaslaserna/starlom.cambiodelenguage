import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { SectionTabs } from "@/components/section-tabs";
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
        <SectionTabs
          tabs={[
            { href: "/sales", label: "Ventas registradas", active: true },
            { href: "/orders/new", label: "Cargar pedido" },
            { href: "/quotes", label: "Presupuestos" },
          ]}
        />

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Comprobantes</div>
            <div className="mt-2 text-2xl font-semibold">{summary.totalInvoices}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Monto vendido</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(summary.totalAmount)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Facturado</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(summary.invoiced)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Pendiente de cobro</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(summary.pending)}</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 hover:bg-[color:var(--panel-subtle)]" href="/orders/new">
            <h2 className="font-semibold">Ventas registradas</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">Listado operativo de pedidos y ventas.</p>
          </Link>
          <Link className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 hover:bg-[color:var(--panel-subtle)]" href="/orders">
            <h2 className="font-semibold">Cargar pedido</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">Alta y seguimiento de pedidos desde el modulo Pedidos.</p>
          </Link>
          <Link className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 hover:bg-[color:var(--panel-subtle)]" href="/quotes">
            <h2 className="font-semibold">Presupuestos</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">Cotizaciones, vencimientos y aceptacion.</p>
          </Link>
        </div>
      </div>
    </ModulePage>
  );
}
