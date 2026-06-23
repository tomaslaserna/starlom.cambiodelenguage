import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";

function deltaLabel(value: number | null) {
  if (value === null) return "Sin comparacion";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export default async function MetricsPage() {
  const session = await requireStaffSession();
  const metrics = await getAdminMetrics(session.companyId);

  const cards = [
    { label: "Ventas del mes", value: formatCurrency(metrics.sales.current), detail: deltaLabel(metrics.sales.deltaPercent) },
    { label: "Cobros del mes", value: formatCurrency(metrics.collections.current), detail: deltaLabel(metrics.collections.deltaPercent) },
    { label: "Stock valorizado", value: formatCurrency(metrics.stock.value), detail: `${formatNumber(metrics.stock.units)} unidades` },
    { label: "Compras del mes", value: formatCurrency(metrics.purchases.current), detail: "Compras registradas" },
    { label: "Por cobrar", value: formatCurrency(metrics.receivables.openTotal), detail: "Ventas entregadas abiertas" },
    { label: "Productos con stock", value: formatNumber(metrics.stock.products), detail: "Catalogo activo con unidades" },
  ];

  return (
    <ModulePage
      active="metrics"
      description="Metricas operativas sin balance financiero; el balance esta separado en su modulo."
      session={session}
      title="Metricas"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4" key={card.label}>
            <div className="text-sm text-[color:var(--muted)]">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
            <div className="mt-2 text-xs text-[color:var(--muted)]">{card.detail}</div>
          </div>
        ))}
      </div>
    </ModulePage>
  );
}
