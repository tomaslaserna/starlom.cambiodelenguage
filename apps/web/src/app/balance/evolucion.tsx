import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/metrics-series";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function Evolucion({ year, points }: { year: string; points: MonthlyPoint[] }) {
  const maxFact = Math.max(1, ...points.map((point) => point.facturacion));
  const w = 720;
  const h = 180;
  const pad = 24;
  const bandWidth = (w - pad * 2) / points.length;

  return (
    <section className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <h2 className="font-semibold text-[color:var(--foreground)]">Evolución {year}</h2>
        <p className="erp-text-caption text-[color:var(--muted)]">
          Facturación (barras) y margen % (línea), por mes.
        </p>
      </div>

      <div className="overflow-x-auto p-4">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={`Facturación y margen mensual ${year}`}
          className="w-full min-w-[560px]"
        >
          {points.map((point, index) => {
            const barH = (point.facturacion / maxFact) * (h - pad * 2);
            const x = pad + index * bandWidth + bandWidth * 0.2;
            const bw = bandWidth * 0.6;
            const y = h - pad - barH;
            return (
              <g key={point.monthKey}>
                <rect x={x} y={y} width={bw} height={barH} rx={2} fill="var(--accent)" opacity={0.85} />
                <text
                  x={pad + index * bandWidth + bandWidth / 2}
                  y={h - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {MES_CORTO[index]}
                </text>
              </g>
            );
          })}
          <polyline
            fill="none"
            stroke="var(--success)"
            strokeWidth={2}
            points={points
              .map((point, index) => {
                const mx = pad + index * bandWidth + bandWidth / 2;
                const pct = point.margenPct ?? 0;
                const my = h - pad - (Math.max(0, Math.min(100, pct)) / 100) * (h - pad * 2);
                return `${mx},${my}`;
              })
              .join(" ")}
          />
        </svg>
      </div>

      <DataTable
        caption={`Evolución mensual ${year}`}
        className="rounded-none border-0 shadow-none"
        minWidth="100%"
        tableLabel={`Evolución mensual ${year}`}
      >
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>Mes</DataTableHead>
            <DataTableHead align="right">Facturación</DataTableHead>
            <DataTableHead align="right">Ganancia bruta</DataTableHead>
            <DataTableHead align="right">Margen</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          {points.map((point, index) => (
            <DataTableRow key={point.monthKey}>
              <DataTableCell>
                {MES_CORTO[index]} {year}
              </DataTableCell>
              <DataTableCell align="right">{formatCurrency(point.facturacion)}</DataTableCell>
              <DataTableCell align="right">{formatCurrency(point.gananciaBruta)}</DataTableCell>
              <DataTableCell align="right">
                {point.margenPct == null ? "—" : `${point.margenPct.toFixed(1)}%`}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </section>
  );
}
