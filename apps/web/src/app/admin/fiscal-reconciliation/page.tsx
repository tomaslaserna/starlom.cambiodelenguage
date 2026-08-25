import { requireStaffSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { inspectFiscalIncident } from "@/lib/fiscal-reconciliation";
import { reconcileFiscalIncidentAction } from "./actions";

export const maxDuration = 60;

export default async function FiscalReconciliationPage({ searchParams }: { searchParams: Promise<{error?: string}> }) {
  const session = await requireStaffSession();
  const state = await inspectFiscalIncident(session);
  const error = (await searchParams).error;
  return <main className="mx-auto grid max-w-5xl gap-6 p-8">
    <h1 className="text-2xl font-semibold">Conciliación fiscal ARCA 24/08/2026</h1>
    {error ? <p className="rounded border border-red-400 bg-red-50 p-3 text-red-800">{error}</p> : null}
    <section className="rounded border p-4"><h2 className="mb-3 text-lg font-semibold">Facturas válidas</h2>
      <div className="grid gap-3">{state.valid.map(item => <div className="flex items-center justify-between gap-4" key={item.invoiceNumber}>
        <span>Factura A 00002-{String(item.invoiceNumber).padStart(8,"0")} · {formatCurrency(item.amount)} · CAE {item.receipt.cae} · {item.linked ? "Vinculada" : "Pendiente de vincular"}</span>
        {!item.linked ? <form action={reconcileFiscalIncidentAction}><input name="action" type="hidden" value="link"/><input name="invoiceNumber" type="hidden" value={item.invoiceNumber}/><button className="rounded bg-blue-700 px-4 py-2 text-white" type="submit">Vincular</button></form> : null}
      </div>)}</div>
    </section>
    <section className="rounded border p-4"><h2 className="mb-3 text-lg font-semibold">Facturas duplicadas</h2>
      <div className="grid gap-3">{state.duplicates.map(item => <div className="flex items-center justify-between gap-4" key={item.invoiceNumber}>
        <span>Factura A 00002-{String(item.invoiceNumber).padStart(8,"0")} · {formatCurrency(item.amount)} · {item.cancellation ? `Anulada con NC 00002-${String(item.cancellation.receiptNumber).padStart(8,"0")} · CAE ${item.cancellation.cae}` : "Pendiente de anular"}</span>
        {!item.cancellation ? <form action={reconcileFiscalIncidentAction}><input name="action" type="hidden" value="cancel"/><input name="invoiceNumber" type="hidden" value={item.invoiceNumber}/><button className="rounded bg-red-700 px-4 py-2 text-white" type="submit">Emitir NC asociada</button></form> : null}
      </div>)}</div>
    </section>
  </main>;
}
