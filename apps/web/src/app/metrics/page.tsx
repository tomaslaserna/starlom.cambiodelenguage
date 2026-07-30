import { ModulePage } from "@/components/module-page";
import { MetricIcon } from "@/components/metric-icon";
import { Card, CardContent, CardHeader, CardTitle, StatCard, StatusBadge, Toolbar } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_METRICS_READ_PERMISSION, REPORTS_READ_PERMISSION } from "@/lib/route-auth";

function compactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return formatCurrency(value);
}

function deltaLabel(value: number | null) {
  if (value === null) return "Sin base comparable";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}% vs. mes anterior`;
}

function progress(current: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (current / total) * 100));
}

function FinancialLine({ label, value, width, tone = "bg-slate-400" }: { label: string; value: string; width: number; tone?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-[color:var(--foreground)]">{label}</span>
        <span className="font-mono font-bold tabular-nums text-[color:var(--foreground)]">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(4, width)}%` }} />
      </div>
    </div>
  );
}

function AlertRow({ detail, icon, label, tone }: { detail: string; icon: "alert" | "money" | "purchase"; label: string; tone: "danger" | "warning" | "info" }) {
  return (
    <div className="grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-2 py-1.5">
      <span className={`flex h-5 w-5 items-center justify-center rounded-md ${tone === "danger" ? "bg-red-50 text-red-600" : tone === "warning" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"}`}>
        <span className="h-3 w-3 [&>svg]:h-full [&>svg]:w-full"><MetricIcon name={icon} /></span>
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold leading-4 text-[color:var(--foreground)]">{label}</div>
        <p className="truncate text-[10px] leading-3.5 text-[color:var(--muted)]">{detail}</p>
      </div>
    </div>
  );
}

export default async function MetricsPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_METRICS_READ_PERMISSION, REPORTS_READ_PERMISSION]);
  const metrics = await getAdminMetrics(session.companyId);

  const grossMargin = progress(metrics.margin.grossProfit, metrics.sales.current);
  const operatingMargin = progress(metrics.margin.operatingResult, metrics.sales.current);
  const collectionCoverage = progress(metrics.collections.current, metrics.collections.current + metrics.receivables.openTotal);
  const cashExposure = metrics.receivables.openTotal - metrics.purchases.openTotal;
  const salesVsPrevious = progress(metrics.sales.current, Math.max(metrics.sales.previous, metrics.sales.current));
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(
    new Date(`${metrics.period.currentStart}T12:00:00`),
  );

  return (
    <ModulePage
      active="metrics"
      description="Salud comercial, liquidez y alertas operativas del mes en curso."
      lockDesktopScroll
      session={session}
      title="Métricas"
    >
      <section className="grid h-full min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-3">
        <Toolbar ariaLabel="Resumen del período" className="min-h-[68px] items-center px-5 py-3 shadow-[var(--shadow-sm)]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#bfd4fb] bg-[#eef4ff] text-[#2563eb] [&>svg]:h-[19px] [&>svg]:w-[19px]">
              <MetricIcon name="calendar" />
            </span>
            <div className="min-w-0">
              <p className="erp-text-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">Período actual</p>
              <h2 className="truncate text-lg font-black tracking-[-0.025em] text-[color:var(--foreground)]">Pulso financiero · {monthLabel}</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="accent">Ventas, caja y stock</StatusBadge>
            <StatusBadge tone={metrics.margin.operatingResult >= 0 ? "success" : "danger"}>Resultado {compactCurrency(metrics.margin.operatingResult)}</StatusBadge>
          </div>
        </Toolbar>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard className="min-h-[104px] px-4 py-3" detail={deltaLabel(metrics.sales.deltaPercent)} icon={<MetricIcon name="sales" />} label="Ventas entregadas" tone="accent" value={compactCurrency(metrics.sales.current)} />
          <StatCard className="min-h-[104px] px-4 py-3" detail={deltaLabel(metrics.collections.deltaPercent)} icon={<MetricIcon name="wallet" />} label="Cobros registrados" tone="success" value={compactCurrency(metrics.collections.current)} />
          <StatCard className="min-h-[104px] px-4 py-3" detail={`${formatNumber(metrics.stock.units)} unidades valorizadas`} icon={<MetricIcon name="stock" />} label="Capital en stock" tone="neutral" value={compactCurrency(metrics.stock.value)} />
          <StatCard className="min-h-[104px] px-4 py-3" detail={`${compactCurrency(metrics.purchases.openTotal)} aún pendiente`} icon={<MetricIcon name="purchase" />} label="Compras del mes" tone="warning" value={compactCurrency(metrics.purchases.current)} />
        </div>

        <Card>
          <CardContent className="flex min-h-[50px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
            <StatusBadge tone={metrics.sales.deltaPercent !== null && metrics.sales.deltaPercent < 0 ? "danger" : "success"}>
              Ventas {deltaLabel(metrics.sales.deltaPercent)}
            </StatusBadge>
            <span className="erp-text-caption font-medium text-[color:var(--muted)]">Margen bruto <strong className="text-[color:var(--foreground)]">{Math.round(grossMargin)}%</strong></span>
            <span className="erp-text-caption font-medium text-[color:var(--muted)]">Cobertura <strong className="text-[color:var(--foreground)]">{Math.round(collectionCoverage)}%</strong></span>
            <span className="erp-text-caption font-medium text-[color:var(--muted)]">Sin stock <strong className="text-[color:var(--foreground)]">{formatNumber(metrics.stock.products)}</strong></span>
          </CardContent>
        </Card>

        <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(335px,0.7fr)]">
          <Card className="min-h-0 overflow-hidden">
            <CardHeader className="flex min-h-[52px] flex-row items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="erp-text-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">Ejecución comercial</p>
                <CardTitle className="mt-0.5">Qué deja cada peso vendido</CardTitle>
              </div>
              <StatusBadge tone="accent">Base: entregadas</StatusBadge>
            </CardHeader>
            <CardContent className="grid h-[calc(100%_-_52px)] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-[color:var(--panel-muted)] px-3 py-2.5">
                  <p className="erp-text-caption font-semibold text-[color:var(--muted)]">Ventas vs. mes anterior</p>
                  <div className="mt-1 flex items-baseline justify-between gap-2"><strong className="font-mono text-xl tracking-[-0.04em] tabular-nums">{compactCurrency(metrics.sales.current)}</strong><span className={metrics.sales.deltaPercent !== null && metrics.sales.deltaPercent < 0 ? "text-xs font-bold text-red-600" : "text-xs font-bold text-emerald-600"}>{deltaLabel(metrics.sales.deltaPercent)}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${Math.max(6, salesVsPrevious)}%` }} /></div>
                </div>
                <div className="rounded-lg bg-[color:var(--panel-muted)] px-3 py-2.5">
                  <p className="erp-text-caption font-semibold text-[color:var(--muted)]">Margen operativo</p>
                  <div className="mt-1 flex items-baseline justify-between gap-2"><strong className="font-mono text-xl tracking-[-0.04em] tabular-nums">{Math.round(operatingMargin)}%</strong><span className="text-xs font-bold text-[color:var(--muted)]">{compactCurrency(metrics.margin.operatingResult)}</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#059669]" style={{ width: `${Math.max(4, operatingMargin)}%` }} /></div>
                </div>
              </div>
              <div className="grid content-evenly gap-2.5 border-t border-[color:var(--border)] pt-3">
                <FinancialLine label="Ingresos entregados" tone="bg-[#2563eb]" value={compactCurrency(metrics.sales.current)} width={100} />
                <FinancialLine label="Costo de mercadería" tone="bg-slate-400" value={compactCurrency(metrics.margin.grossCost)} width={progress(metrics.margin.grossCost, metrics.sales.current)} />
                <FinancialLine label="Costos operativos" tone="bg-[#d97706]" value={compactCurrency(metrics.margin.operatingCosts)} width={progress(metrics.margin.operatingCosts, metrics.sales.current)} />
                <FinancialLine label="Resultado operativo" tone={metrics.margin.operatingResult >= 0 ? "bg-[#059669]" : "bg-[#dc2626]"} value={compactCurrency(metrics.margin.operatingResult)} width={Math.abs(progress(metrics.margin.operatingResult, metrics.sales.current))} />
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardHeader className="flex min-h-[52px] flex-row items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="erp-text-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">Caja y compromisos</p>
                <CardTitle className="mt-0.5">Liquidez bajo control</CardTitle>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef4ff] text-[#2563eb] [&>svg]:h-4 [&>svg]:w-4"><MetricIcon name="money" /></span>
            </CardHeader>
            <CardContent className="grid h-[calc(100%_-_52px)] min-h-0 grid-cols-2 gap-3 p-4">
              <div className="grid content-start gap-2.5">
                <div className="rounded-lg bg-[#10213b] px-3 py-2 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-200">Exposición neta</p>
                  <div className="mt-0.5 font-mono text-xl font-black tracking-[-0.04em] tabular-nums">{compactCurrency(cashExposure)}</div>
                  <p className="mt-0.5 text-[10px] leading-3.5 text-slate-300">Por cobrar menos compromisos abiertos.</p>
                </div>
                <div className="grid gap-2">
                  <FinancialLine label="Por cobrar" tone="bg-[#2563eb]" value={compactCurrency(metrics.receivables.openTotal)} width={100} />
                  <FinancialLine label="Por pagar" tone="bg-[#d97706]" value={compactCurrency(metrics.purchases.openTotal)} width={progress(metrics.purchases.openTotal, Math.max(metrics.receivables.openTotal, metrics.purchases.openTotal))} />
                  <FinancialLine label="Cobrado en el mes" tone="bg-[#059669]" value={compactCurrency(metrics.collections.current)} width={collectionCoverage} />
                </div>
              </div>
              <div className="grid content-start gap-1.5 border-l border-[color:var(--border)] pl-3">
                <p className="erp-text-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">Alertas para decidir hoy</p>
                <AlertRow detail={`${compactCurrency(metrics.receivables.openTotal)} pendiente de cobro`} icon="money" label="Cobranza abierta" tone="warning" />
                <AlertRow detail={`${formatNumber(metrics.stock.products)} productos sin stock efectivo`} icon="alert" label="Riesgo de stock" tone="danger" />
                <AlertRow detail={`${compactCurrency(metrics.purchases.openTotal)} comprometido en compras`} icon="purchase" label="Compromisos de compra" tone="info" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </ModulePage>
  );
}
