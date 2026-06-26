import { redirect } from "next/navigation";
import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import {
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { isStaffRole, requireSession } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  sessionCanApproveCollections,
  sessionCanReadCollections,
  sessionCanReadCustomers,
  sessionCanReadEmployees,
  sessionCanReadProducts,
  sessionCanReadSuppliers,
} from "@/lib/route-auth";

function deltaLabel(value: number | null) {
  if (value === null) return "Sin comparacion mensual";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}% vs mes anterior`;
}

type Shortcut = {
  href: string;
  label: string;
  detail: string;
};

function ShortcutList({ items }: { items: Shortcut[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          className="group flex min-h-[82px] items-start justify-between gap-3 rounded-[9px] border border-[#d9e2ef] bg-white px-4 py-4 text-left text-[#0f172a] shadow-[var(--shadow-xs)] transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:border-[#bfdbfe] hover:bg-[#fbfdff] hover:shadow-[0_10px_24px_rgba(15,23,42,0.07)]"
          href={item.href}
          key={item.href}
        >
          <span className="grid min-w-0 gap-1">
            <span className="erp-text-body-sm font-black">{item.label}</span>
            <span className="erp-text-caption font-medium text-[#64748b]">{item.detail}</span>
          </span>
          <span className="erp-text-caption ml-3 shrink-0 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2 py-1 font-black text-[#1d4ed8] transition-colors group-hover:bg-[#2563eb] group-hover:text-white">
            Abrir
          </span>
        </Link>
      ))}
    </div>
  );
}

export default async function Home() {
  const session = await requireSession();
  if (!isStaffRole(session.role)) redirect("/login");

  const [
    metrics,
    canReadCollections,
    canApproveCollections,
    canReadCustomers,
    canReadSuppliers,
    canReadProducts,
    canReadEmployees,
  ] = await Promise.all([
    getAdminMetrics(session.companyId),
    sessionCanReadCollections(session),
    sessionCanApproveCollections(session),
    sessionCanReadCustomers(session),
    sessionCanReadSuppliers(session),
    sessionCanReadProducts(session),
    sessionCanReadEmployees(session),
  ]);

  const commercialShortcuts: Shortcut[] = [
    { href: "/sales", label: "Ventas", detail: "Resumen comercial y accesos de venta." },
    { href: "/orders", label: "Pedidos", detail: "Seguimiento por estado operativo." },
    { href: "/orders/new", label: "Cargar pedido", detail: "Alta de pedido o presupuesto." },
    { href: "/quotes", label: "Presupuestos", detail: "Presupuestos pendientes y aprobados." },
    { href: "/billing", label: "Facturacion", detail: "Documentos comerciales y fiscales." },
  ];

  const financeShortcuts: Shortcut[] = [
    { href: "/metrics", label: "Metricas", detail: "Indicadores comerciales y operativos." },
    { href: "/balance", label: "Balance", detail: "Resumen financiero y resultado." },
    { href: "/treasury", label: "Tesoreria", detail: "Saldos actuales por cuenta." },
    { href: "/treasury/cash-flow", label: "Cash Flow", detail: "Ingresos y egresos proyectados." },
    { href: "/treasury/accounts-payable", label: "Cuentas por pagar", detail: "Compromisos pendientes." },
  ];

  if (canReadCollections) {
    financeShortcuts.push({ href: "/collections", label: "Cobros", detail: "Cobros pendientes y registrados." });
  }
  if (canApproveCollections) {
    financeShortcuts.push({
      href: "/admin/approvals",
      label: "Solicitudes y aprobaciones",
      detail: "Validacion administrativa de operaciones.",
    });
  }

  const dataShortcuts: Shortcut[] = [
    { href: "/database", label: "Base de datos", detail: "Accesos a maestros del sistema." },
    { href: "/purchases", label: "Compras", detail: "Compras, paquetes y pagos asociados." },
    { href: "/calendar", label: "Calendario", detail: "Recordatorios y tareas." },
    { href: "/messages", label: "Mensajes", detail: "Comunicacion interna." },
  ];

  if (canReadProducts) {
    dataShortcuts.push(
      { href: "/products", label: "Productos y stock", detail: "Catalogo, costos y existencias." },
      { href: "/pricing", label: "Precios", detail: "Margenes, listas y rubros." },
    );
  }
  if (canReadCustomers) {
    dataShortcuts.push({ href: "/customers", label: "Clientes", detail: "Directorio comercial." });
  }
  if (canReadSuppliers) {
    dataShortcuts.push({ href: "/suppliers", label: "Proveedores", detail: "Directorio de compras." });
  }
  if (canReadEmployees) {
    dataShortcuts.push(
      { href: "/employees", label: "Empleados", detail: "Usuarios, roles y permisos." },
      { href: "/employees/vendors", label: "Vendedores", detail: "Metas y metricas comerciales." },
    );
  }

  return (
    <ModulePage
      active="home"
      description="Panel principal para operar ventas, finanzas, tesoreria, datos y administracion."
      session={session}
      title="Inicio"
    >
      <div className="grid gap-5">
        <PageHeader
          actions={
            <>
              <ButtonLink href="/orders/new">Cargar pedido</ButtonLink>
              <ButtonLink href="/orders" variant="secondary">
                Ver pedidos
              </ButtonLink>
            </>
          }
          description="Resumen diario y accesos directos a los modulos de trabajo del ERP."
          eyebrow="Operacion diaria"
          title="Panel ERP"
        />

        <section className="grid gap-3 rounded-[10px] border border-[#d9e2ef] bg-[#0f172a] p-4 text-white shadow-[0_12px_30px_rgba(15,23,42,0.14)] md:grid-cols-3">
          <div className="min-w-0">
            <div className="erp-text-caption font-black uppercase text-white/55">Foco comercial</div>
            <div className="erp-text-title-sm mt-1 font-black text-white">Ventas, pedidos y presupuestos</div>
          </div>
          <div className="min-w-0 rounded-[9px] border border-white/10 bg-white/8 px-3 py-2">
            <div className="erp-text-caption font-black uppercase text-white/55">Pendiente de cobro</div>
            <div className="erp-text-title-sm mt-1 font-black text-white">{formatCurrency(metrics.receivables.openTotal)}</div>
          </div>
          <div className="min-w-0 rounded-[9px] border border-white/10 bg-white/8 px-3 py-2">
            <div className="erp-text-caption font-black uppercase text-white/55">Stock disponible</div>
            <div className="erp-text-title-sm mt-1 font-black text-white">{formatNumber(metrics.stock.units)} unidades</div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            detail={deltaLabel(metrics.sales.deltaPercent)}
            label="Ventas del mes"
            tone="accent"
            value={formatCurrency(metrics.sales.current)}
          />
          <StatCard
            detail={deltaLabel(metrics.collections.deltaPercent)}
            label="Cobros del mes"
            tone="success"
            value={formatCurrency(metrics.collections.current)}
          />
          <StatCard
            detail="Ventas entregadas abiertas"
            label="Por cobrar"
            tone="warning"
            value={formatCurrency(metrics.receivables.openTotal)}
          />
          <StatCard
            detail={`${formatNumber(metrics.stock.units)} unidades`}
            label="Stock valorizado"
            tone="info"
            value={formatCurrency(metrics.stock.value)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Comercial</CardTitle>
              <CardDescription>Ventas, pedidos, presupuestos y facturacion.</CardDescription>
            </CardHeader>
            <CardContent>
              <ShortcutList items={commercialShortcuts} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finanzas y tesoreria</CardTitle>
              <CardDescription>Indicadores, saldos, cash flow, cobros y aprobaciones.</CardDescription>
            </CardHeader>
            <CardContent>
              <ShortcutList items={financeShortcuts} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Datos y operaciones</CardTitle>
            <CardDescription>Maestros, compras, stock, calendario, mensajes y administracion.</CardDescription>
          </CardHeader>
          <CardContent>
            <ShortcutList items={dataShortcuts} />
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
