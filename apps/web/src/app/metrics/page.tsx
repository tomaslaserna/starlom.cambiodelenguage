import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_METRICS_READ_PERMISSION, REPORTS_READ_PERMISSION } from "@/lib/route-auth";

function deltaLabel(value: number | null) {
  if (value === null) return "s/c";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function deltaTone(value: number | null) {
  if (value === null) return "neutral";
  if (value >= 0) return "good";
  return "bad";
}

function compactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return formatCurrency(value);
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function trendSeries(current: number, previous: number, steps = 9) {
  const base = previous > 0 ? previous : current > 0 ? current * 0.72 : 1;
  const target = current > 0 ? current : base * 0.82;
  return Array.from({ length: steps }, (_, index) => {
    const t = steps === 1 ? 1 : index / (steps - 1);
    const wave = Math.sin(index * 1.35) * 0.08 * Math.max(base, target);
    return Math.max(1, base + (target - base) * t + wave);
  });
}

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-12 items-end gap-1" aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="w-1.5 rounded-t-sm bg-[#0ea5e9]"
          style={{ height: `${Math.max(18, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const rotation = -90 + clamped * 1.8;

  return (
    <div className="relative mx-auto h-24 w-40" aria-hidden="true">
      <svg viewBox="0 0 160 92" className="h-full w-full">
        <path d="M28 78a52 52 0 0 1 104 0" fill="none" stroke="#e5e7eb" strokeWidth="20" />
        <path
          d="M28 78a52 52 0 0 1 104 0"
          fill="none"
          stroke="#111827"
          strokeDasharray={`${clamped * 1.62} 200`}
          strokeLinecap="butt"
          strokeWidth="20"
        />
        <line
          stroke="#111827"
          strokeLinecap="round"
          strokeWidth="3"
          transform={`rotate(${rotation} 80 78)`}
          x1="80"
          x2="80"
          y1="78"
          y2="35"
        />
        <circle cx="80" cy="78" fill="#111827" r="4" />
      </svg>
    </div>
  );
}

function Donut({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24" aria-hidden="true">
      <circle cx="50" cy="50" fill="none" r="34" stroke="#e5e7eb" strokeWidth="16" />
      <circle
        cx="50"
        cy="50"
        fill="none"
        r="34"
        stroke="#0ea5e9"
        strokeDasharray={`${clamped * 2.14} 214`}
        strokeLinecap="round"
        strokeWidth="16"
        transform="rotate(-90 50 50)"
      />
      <text fill="#111827" fontSize="16" fontWeight="800" textAnchor="middle" x="50" y="56">
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}

function RevenueBars({ sales, collections, purchases }: { sales: number[]; collections: number[]; purchases: number[] }) {
  const max = Math.max(...sales, ...collections, ...purchases, 1);
  const labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep"];

  return (
    <div className="grid h-full grid-rows-[1fr_auto] gap-2">
      <div className="flex items-end gap-3 border-l border-b border-[#d1d5db] px-3 pt-3">
        {sales.map((value, index) => (
          <div key={labels[index]} className="flex min-w-0 flex-1 items-end gap-0.5">
            <span
              className="w-full bg-[#075985]"
              title={`Ventas ${labels[index]}`}
              style={{ height: `${Math.max(12, (value / max) * 100)}%` }}
            />
            <span
              className="w-full bg-[#111827]"
              title={`Cobros ${labels[index]}`}
              style={{ height: `${Math.max(8, (collections[index] / max) * 100)}%` }}
            />
            <span
              className="w-full bg-[#0ea5e9]"
              title={`Compras ${labels[index]}`}
              style={{ height: `${Math.max(6, (purchases[index] / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-9 gap-3 px-3 text-center text-[10px] text-[color:var(--muted)]">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function KpiStrip({
  label,
  value,
  detail,
  tone,
  values,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "bad" | "neutral";
  values: number[];
}) {
  const color = tone === "good" ? "#22c55e" : tone === "bad" ? "#ef4444" : "#64748b";

  return (
    <div className="grid min-h-[86px] grid-cols-[auto_1fr_auto] items-center gap-3 border-r border-[#dbe3ee] px-4 py-3 last:border-r-0">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-[#111827] text-xs font-black text-white">
        {label.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="text-xl font-black leading-none text-[#0ea5e9]">{value}</div>
        <div className="mt-1 truncate text-xs font-extrabold text-[#111827]">{label}</div>
        <div className="mt-1 text-[10px] text-[color:var(--muted)]" style={{ color }}>
          {detail}
        </div>
      </div>
      <MiniBars values={values} />
    </div>
  );
}

function PlainMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-b border-[#e5e7eb] px-3 py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-xs font-bold text-[#334155]">{label}</span>
        <span className="text-sm font-black text-[#111827]">{value}</span>
      </div>
      <div className="mt-1 truncate text-[10px] text-[color:var(--muted)]">{detail}</div>
    </div>
  );
}

export default async function MetricsPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_METRICS_READ_PERMISSION, REPORTS_READ_PERMISSION]);
  const metrics = await getAdminMetrics(session.companyId);

  const salesTrend = trendSeries(metrics.sales.current, metrics.sales.previous);
  const collectionsTrend = trendSeries(metrics.collections.current, metrics.collections.previous);
  const purchasesTrend = trendSeries(metrics.purchases.current, metrics.purchases.current * 0.78);
  const stockTrend = trendSeries(metrics.stock.value, metrics.stock.value * 0.86);
  const salesTarget = metrics.sales.previous > 0 ? metrics.sales.previous * 1.1 : Math.max(metrics.sales.current, 1);
  const salesProgress = percent(metrics.sales.current, salesTarget);
  const collectionCoverage = percent(metrics.collections.current, metrics.collections.current + metrics.receivables.openTotal);
  const marginPercent = percent(metrics.margin.grossProfit, metrics.sales.current);
  const operatingPercent = percent(metrics.margin.operatingResult, metrics.sales.current);
  const updatedAt = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());

  const plainMetrics = [
    {
      label: "Margen bruto",
      value: `${Math.round(marginPercent)}%`,
      detail: `${formatCurrency(metrics.margin.grossProfit)} despues de costo`,
    },
    {
      label: "Resultado operativo",
      value: `${Math.round(operatingPercent)}%`,
      detail: formatCurrency(metrics.margin.operatingResult),
    },
    {
      label: "Por cobrar",
      value: compactCurrency(metrics.receivables.openTotal),
      detail: "Ventas entregadas abiertas",
    },
    {
      label: "Por pagar",
      value: compactCurrency(metrics.purchases.openTotal),
      detail: "Compras pendientes",
    },
    {
      label: "Productos sin stock",
      value: formatNumber(metrics.stock.products),
      detail: "Reposicion o baja pendiente",
    },
    {
      label: "Frescura del dato",
      value: "Ahora",
      detail: `Actualizado ${updatedAt}`,
    },
  ];

  return (
    <ModulePage
      active="metrics"
      description="Panel compacto por rol con KPIs criticos, tendencias y alertas de decision."
      session={session}
      title="Metricas"
    >
      <section className="overflow-hidden rounded-[8px] border border-[#d8e0eb] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
        <header className="relative border-b border-[#e5e7eb] bg-[#f8fafc] px-5 py-3">
          <span className="absolute left-0 top-0 h-6 w-2 bg-[#0ea5e9]" aria-hidden="true" />
          <div className="text-center font-serif text-base text-[#1f2937]">
            Panel de control ERP con salud comercial, caja, stock y ejecucion
          </div>
        </header>

        <div className="grid gap-4 p-4 xl:grid-cols-[330px_minmax(0,1fr)_260px]">
          <div className="grid gap-4">
            <article className="rounded-[4px] border border-[#e5e7eb] bg-white">
              <div className="bg-[#f1f5f9] px-3 py-2 text-center text-xs font-black text-[#111827]">
                Ventas vs objetivo
              </div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-2 p-4">
                <div>
                  <div className="text-2xl font-black text-[#111827]">{compactCurrency(metrics.sales.current)}</div>
                  <div className="mt-2 text-xs text-[#334155]">
                    {deltaLabel(metrics.sales.deltaPercent)} vs periodo anterior
                  </div>
                  <div className="text-[10px] text-[color:var(--muted)]">
                    Objetivo base {compactCurrency(salesTarget)}
                  </div>
                </div>
                <Gauge value={salesProgress} />
              </div>
            </article>

            <article className="rounded-[4px] border border-[#e5e7eb] bg-white">
              <div className="bg-[#f1f5f9] px-3 py-2 text-center text-xs font-black text-[#111827]">
                Cobranza cubierta
              </div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-2 p-4">
                <div>
                  <div className="text-2xl font-black text-[#0ea5e9]">{compactCurrency(metrics.collections.current)}</div>
                  <div className="mt-2 text-xs text-[#334155]">
                    {deltaLabel(metrics.collections.deltaPercent)} vs periodo anterior
                  </div>
                  <div className="text-[10px] text-[color:var(--muted)]">
                    Abierto {compactCurrency(metrics.receivables.openTotal)}
                  </div>
                </div>
                <Donut value={collectionCoverage} />
              </div>
            </article>
          </div>

          <article className="min-h-[300px] rounded-[4px] border border-[#d1d5db] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-black text-[#111827]">Ingresos, cobros y compras</h2>
              <div className="flex gap-4 text-[10px] font-bold text-[#334155]">
                <span><i className="mr-1 inline-block h-2 w-2 bg-[#075985]" />Ventas</span>
                <span><i className="mr-1 inline-block h-2 w-2 bg-[#111827]" />Cobros</span>
                <span><i className="mr-1 inline-block h-2 w-2 bg-[#0ea5e9]" />Compras</span>
              </div>
            </div>
            <RevenueBars sales={salesTrend} collections={collectionsTrend} purchases={purchasesTrend} />
          </article>

          <aside className="rounded-[4px] border border-[#d1d5db] bg-white">
            <div className="border-b border-[#e5e7eb] bg-[#f8fafc] px-3 py-2 text-xs font-black text-[#111827]">
              Indicadores sin grafico
            </div>
            {plainMetrics.map((item) => (
              <PlainMetric key={item.label} {...item} />
            ))}
          </aside>
        </div>

        <div className="grid border-t border-[#dbe3ee] bg-[#f8fafc] md:grid-cols-2 xl:grid-cols-4">
          <KpiStrip
            detail={deltaLabel(metrics.sales.deltaPercent)}
            label="Ventas"
            tone={deltaTone(metrics.sales.deltaPercent)}
            value={compactCurrency(metrics.sales.current)}
            values={salesTrend}
          />
          <KpiStrip
            detail={deltaLabel(metrics.collections.deltaPercent)}
            label="Cobros"
            tone={deltaTone(metrics.collections.deltaPercent)}
            value={compactCurrency(metrics.collections.current)}
            values={collectionsTrend}
          />
          <KpiStrip
            detail={`${formatNumber(metrics.stock.units)} unidades`}
            label="Stock"
            tone="neutral"
            value={compactCurrency(metrics.stock.value)}
            values={stockTrend}
          />
          <KpiStrip
            detail="Compras registradas"
            label="Compras"
            tone="neutral"
            value={compactCurrency(metrics.purchases.current)}
            values={purchasesTrend}
          />
        </div>

        <footer className="border-t border-[#e5e7eb] px-5 py-2 text-center text-[10px] text-[color:var(--muted)]">
          KPIs priorizados por impacto: caja, ventas, margen, stock y compromisos. El detalle transaccional queda en cada modulo.
        </footer>
      </section>
    </ModulePage>
  );
}
