import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatDate } from "@/lib/format";
import { listQuotes } from "@/lib/quotes";
import { requireStaffSession } from "@/lib/auth";
import { acceptQuoteAction } from "@/app/quotes/actions";

type QuotesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

const quoteStates = [
  { value: "pendiente", label: "Pendientes" },
  { value: "aceptada", label: "Aceptadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "all", label: "Todas" },
];

function matchesQuery(item: Awaited<ReturnType<typeof listQuotes>>[number], query: string) {
  if (!query) return true;
  return [item.customer.name, item.customer.businessName, item.customer.taxId, item.createdBy]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const status = params.status?.trim() || "pendiente";
  const query = params.q?.trim().toLowerCase() ?? "";
  const quotes = (await listQuotes(session.companyId, status === "all" ? "" : status)).filter((item) =>
    matchesQuery(item, query),
  );
  const total = quotes.reduce((sum, quote) => sum + quote.total, 0);
  const expired = quotes.filter((quote) => quote.valid === false).length;

  return (
    <ModulePage
      active="sales"
      description="Presupuestos comerciales migrados a Node, con estado, vencimiento y totales calculados."
      session={session}
      title="Presupuestos"
    >
      <div className="grid gap-5">
        <form
          action="/quotes"
          className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[1fr_220px_auto] md:items-center"
        >
          <input
            className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Buscar cliente, razon social, CUIT o creador"
          />
          <select
            className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            defaultValue={status}
            name="status"
          >
            {quoteStates.map((state) => (
              <option key={state.value} value={state.value}>
                {state.label}
              </option>
            ))}
          </select>
          <button className="min-h-11 rounded-md bg-[color:var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[color:var(--accent-strong)]">
            Filtrar
          </button>
        </form>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Presupuestos</div>
            <div className="mt-2 text-2xl font-semibold">{quotes.length}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Total filtrado</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(total)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Vencidos en filtro</div>
            <div className="mt-2 text-2xl font-semibold">{expired}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Presupuesto</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Emision</th>
                  <th className="px-4 py-3 font-semibold">Vencimiento</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Neto</th>
                  <th className="px-4 py-3 text-right font-semibold">IVA</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 font-semibold">Accion</th>
                </tr>
              </thead>
              <tbody>
                {quotes.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={9}>
                      No hay presupuestos para los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  quotes.map((quote) => (
                    <tr className="border-t border-[color:var(--border)]" key={quote.id}>
                      <td className="px-4 py-4">
                        <div className="font-mono text-xs">#{quote.id}</div>
                        <div className="text-xs text-[color:var(--muted)]">{quote.createdBy || "-"}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium">
                          {quote.customer.name || quote.customer.businessName || "Sin cliente"}
                        </div>
                        <div className="font-mono text-xs text-[color:var(--muted)]">
                          {quote.customer.taxId || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-4">{formatDate(quote.issueDate)}</td>
                      <td className="px-4 py-4">{formatDate(quote.expirationDate)}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs">
                          {quote.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs">
                        {formatCurrency(quote.subtotal)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs">
                        {formatCurrency(quote.vatAmount)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs">
                        {formatCurrency(quote.total)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="grid min-w-[120px] gap-2">
                          <a
                            className="min-h-10 rounded-md border border-[color:var(--border)] px-3 py-2 text-center text-xs font-semibold hover:bg-[color:var(--panel-subtle)]"
                            href={`/api/pdfs/quotes/${quote.id}`}
                            target="_blank"
                          >
                            PDF
                          </a>
                          {quote.status === "pendiente" ? (
                            <form action={acceptQuoteAction}>
                              <input name="id" type="hidden" value={quote.id} />
                              <button className="min-h-10 w-full rounded-md bg-[color:var(--accent)] px-3 text-xs font-semibold text-white hover:bg-[color:var(--accent-strong)]">
                                Aceptar
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-[color:var(--muted)]">Sin accion</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ModulePage>
  );
}
