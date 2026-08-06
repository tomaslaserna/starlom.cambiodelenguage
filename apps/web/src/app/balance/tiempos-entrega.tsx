import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui";
import { formatDuration } from "@/lib/delivery-times";

type Delivery = { saleId: string; pedido: string; cliente: string; deliveredAt: string; leadMs: number };
type Props = {
  data: { deliveries: Delivery[]; summary: { count: number; avgMs: number | null; medianMs: number | null } };
};

export function TiemposEntrega({ data }: Props) {
  const { deliveries, summary } = data;
  const cards = [
    { label: "Entregas", value: String(summary.count) },
    { label: "Promedio", value: summary.avgMs == null ? "—" : formatDuration(summary.avgMs) },
    { label: "Mediana", value: summary.medianMs == null ? "—" : formatDuration(summary.medianMs) },
  ];

  return (
    <section className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <h2 className="font-semibold text-[color:var(--foreground)]">Tiempos de entrega</h2>
        <p className="erp-text-caption text-[color:var(--muted)]">
          Desde que se carga el pedido hasta que se marca entregado, en el período.
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4">
            <div className="text-[1.5rem] font-bold leading-none tabular-nums text-[color:var(--foreground)]">{card.value}</div>
            <div className="erp-text-body mt-1 font-semibold text-[color:var(--foreground)]">{card.label}</div>
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
              <DataTableHead align="right">Tiempo</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {deliveries.map((delivery) => (
              <DataTableRow key={delivery.saleId}>
                <DataTableCell className="tabular-nums">{delivery.pedido || "—"}</DataTableCell>
                <DataTableCell>{delivery.cliente || "Sin cliente"}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">{delivery.deliveredAt}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">{formatDuration(delivery.leadMs)}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </section>
  );
}
