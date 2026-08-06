import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui";

type ChurnEntry = { customerId: string; customerName: string; seller: string; date: string };
type Props = {
  churn: { altas: ChurnEntry[]; bajas: ChurnEntry[]; counts: { altas: number; bajas: number; net: number } };
};

function Lista({ title, tone, entries }: { title: string; tone: string; entries: ChurnEntry[] }) {
  return (
    <DataTable
      caption={title}
      className="rounded-none border-0 shadow-none"
      minWidth="100%"
      tableLabel={title}
    >
      <DataTableHeader>
        <DataTableRow>
          <DataTableHead>
            <span style={{ color: tone }}>{title}</span>
          </DataTableHead>
          <DataTableHead align="right">Fecha</DataTableHead>
        </DataTableRow>
      </DataTableHeader>
      <DataTableBody>
        {entries.length === 0 ? (
          <DataTableRow>
            <DataTableCell>Sin movimientos en el período.</DataTableCell>
            <DataTableCell align="right">—</DataTableCell>
          </DataTableRow>
        ) : (
          entries.map((entry) => (
            <DataTableRow key={entry.customerId}>
              <DataTableCell>
                <div className="font-semibold text-[color:var(--foreground)]">{entry.customerName || "Sin nombre"}</div>
                {entry.seller ? <div className="erp-text-caption text-[color:var(--muted)]">{entry.seller}</div> : null}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">{entry.date}</DataTableCell>
            </DataTableRow>
          ))
        )}
      </DataTableBody>
    </DataTable>
  );
}

export function ChurnClientes({ churn }: Props) {
  const cards = [
    { label: "Altas", value: churn.counts.altas, tone: "var(--success)" },
    { label: "Bajas", value: churn.counts.bajas, tone: "var(--danger)" },
    { label: "Neto", value: churn.counts.net, tone: churn.counts.net >= 0 ? "var(--success)" : "var(--danger)" },
  ];

  return (
    <section className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <h2 className="font-semibold text-[color:var(--foreground)]">Clientes: altas y bajas</h2>
        <p className="erp-text-caption text-[color:var(--muted)]">
          Nuevos (primera compra) y perdidos (cruzaron su ritmo) en el período.
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4">
            <div className="text-[1.75rem] font-bold leading-none tabular-nums" style={{ color: card.tone }}>
              {card.label === "Neto" && card.value > 0 ? `+${card.value}` : card.value}
            </div>
            <div className="erp-text-body mt-1 font-semibold text-[color:var(--foreground)]">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-0 border-t border-[color:var(--border)] md:grid-cols-2 md:divide-x md:divide-[color:var(--border)]">
        <Lista title="Nuevos" tone="var(--success)" entries={churn.altas} />
        <Lista title="Perdidos" tone="var(--danger)" entries={churn.bajas} />
      </div>
    </section>
  );
}
