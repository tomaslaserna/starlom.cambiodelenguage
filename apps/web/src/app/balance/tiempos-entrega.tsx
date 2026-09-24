import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui";
import { formatDuration } from "@/lib/delivery-times";
import { formatCurrency } from "@/lib/format";

type Delivery = { saleId: string; pedido: string; cliente: string; deliveredAt: string; leadMs: number; totalAmount: number };
type Summary = { count: number; avgMs: number | null; medianMs: number | null; averageTicket: number | null };
type Props = {
  data: { deliveries: Delivery[]; summary: Summary };
  previousSummary: Summary;
  comparisonLabel: string;
};

function variation(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function TiemposEntrega({ data, previousSummary, comparisonLabel }: Props) {
  const { deliveries, summary } = data;
  const cards = [
    { label: "Entregas", value: String(summary.count), change: variation(summary.count, previousSummary.count), lowerIsBetter: false },
    { label: "Promedio", value: summary.avgMs == null ? "—" : formatDuration(summary.avgMs), change: variation(summary.avgMs, previousSummary.avgMs), lowerIsBetter: true },
    { label: "Mediana", value: summary.medianMs == null ? "—" : formatDuration(summary.medianMs), change: variation(summary.medianMs, previousSummary.medianMs), lowerIsBetter: true },
    { label: "Ticket promedio", value: summary.averageTicket == null ? "—" : formatCurrency(summary.averageTicket), change: variation(summary.averageTicket, previousSummary.averageTicket), lowerIsBetter: false },
  ];

  return (
    <section className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <h2 className="font-semibold text-[color:var(--foreground)]">Tiempos de entrega</h2>
        <p className="erp-text-caption text-[color:var(--muted)]">
          Tiempo corrido de calendario desde la carga hasta la entrega. El ticket corresponde al total final con IVA de esas ventas.
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4">
            <div className="text-[1.5rem] font-bold leading-none tabular-nums text-[color:var(--foreground)]">{card.value}</div>
            <div className="erp-text-body mt-1 font-semibold text-[color:var(--foreground)]">{card.label}</div>
            {card.change == null ? (
              <div className="mt-1 text-xs font-semibold text-[color:var(--muted)]">Sin base del {comparisonLabel}</div>
            ) : (
              <div
                className={`mt-1 text-xs font-bold tabular-nums ${
                  (card.lowerIsBetter ? card.change <= 0 : card.change >= 0) ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {card.change > 0 ? "+" : ""}{card.change.toFixed(1)}% vs. {comparisonLabel}
              </div>
            )}
          </div>
        ))}
      </div>

      {deliveries.length === 0 ? (
        <p className="erp-text-body-sm border-t border-[color:var(--border)] px-4 py-8 text-center text-[color:var(--muted)]">
          Se llena a medida que marcás pedidos como entregados en la app (cargado → entregado).
        </p>
      ) : (
        <DataTable
          caption="Entregas del período"
          className="rounded-none border-0 border-t border-[color:var(--border)] shadow-none"
          minWidth="100%"
          tableLabel="Entregas del período"
        >
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>Pedido</DataTableHead>
              <DataTableHead>Cliente</DataTableHead>
              <DataTableHead align="right">Entrega</DataTableHead>
              <DataTableHead align="right">Tiempo corrido</DataTableHead>
              <DataTableHead align="right">Ticket</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {deliveries.map((delivery) => (
              <DataTableRow key={delivery.saleId}>
                <DataTableCell className="tabular-nums">{delivery.pedido || "—"}</DataTableCell>
                <DataTableCell>{delivery.cliente || "Sin cliente"}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">{delivery.deliveredAt}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">{formatDuration(delivery.leadMs)}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">{formatCurrency(delivery.totalAmount)}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </section>
  );
}
