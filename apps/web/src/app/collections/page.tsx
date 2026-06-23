import { ModulePage } from "@/components/module-page";
import { SearchBar } from "@/components/search-bar";
import { listPendingCollections } from "@/lib/collections";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import {
  approveCollectionAction,
  rejectCollectionAction,
} from "@/app/collections/actions";

type CollectionsPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

function matchesQuery(item: Awaited<ReturnType<typeof listPendingCollections>>[number], query: string) {
  if (!query) return true;
  const haystack = [
    item.customerName,
    item.customerDocument,
    item.customerCode,
    item.customerTaxId,
    item.destination,
    item.operation,
    item.registeredBy,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export default async function CollectionsPage({ searchParams }: CollectionsPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const allCollections = await listPendingCollections(session.companyId);
  const collections = allCollections.filter((item) => matchesQuery(item, query));
  const totalPending = collections.reduce((sum, item) => sum + item.registeredAmount, 0);

  return (
    <ModulePage
      active="collections"
      description="Cola de cobros registrados que administracion debe aprobar o rechazar."
      session={session}
      title="Cobros"
    >
      <div className="grid gap-5">
        <div className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[1fr_auto] md:items-center">
          <SearchBar
            action="/collections"
            placeholder="Buscar cliente, CUIT, operacion o responsable"
            query={params.q ?? ""}
          />
          <div className="rounded-md bg-[color:var(--panel-subtle)] px-3 py-2 text-sm">
            <span className="font-semibold">{collections.length}</span>{" "}
            <span className="text-[color:var(--muted)]">pendientes</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Monto pendiente de aprobacion</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(totalPending)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Cola total sin filtro</div>
            <div className="mt-2 text-2xl font-semibold">{allCollections.length}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Venta</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Metodo</th>
                  <th className="px-4 py-3 font-semibold">Destino</th>
                  <th className="px-4 py-3 font-semibold">Fecha cobro</th>
                  <th className="px-4 py-3 font-semibold">Registrado por</th>
                  <th className="px-4 py-3 font-semibold">Comprobantes</th>
                  <th className="px-4 py-3 text-right font-semibold">Monto</th>
                  <th className="px-4 py-3 font-semibold">Accion</th>
                </tr>
              </thead>
              <tbody>
                {collections.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={9}>
                      No hay cobros pendientes para esta busqueda.
                    </td>
                  </tr>
                ) : (
                  collections.map((item) => (
                    <tr className="border-t border-[color:var(--border)]" key={item.id}>
                      <td className="px-4 py-4">
                        <div className="font-mono text-xs">#{item.id}</div>
                        <div className="text-xs text-[color:var(--muted)]">
                          Remito {item.remittanceLabel}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium">{item.customerName || "Sin cliente"}</div>
                        <div className="font-mono text-xs text-[color:var(--muted)]">
                          {item.customerTaxId || item.customerDocument || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-4">{item.method || "-"}</td>
                      <td className="px-4 py-4">
                        <div>{item.destination || "-"}</div>
                        <div className="text-xs text-[color:var(--muted)]">
                          {item.operation || "Sin operacion"}
                        </div>
                      </td>
                      <td className="px-4 py-4">{formatDate(item.collectionDate)}</td>
                      <td className="px-4 py-4">{item.registeredBy || "-"}</td>
                      <td className="px-4 py-4">
                        <a
                          className="font-semibold text-[color:var(--accent)]"
                          href={`/api/sales-documents?saleId=${item.id}`}
                          target="_blank"
                        >
                          {item.associatedDocuments} asociados
                        </a>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs">
                        {formatCurrency(item.registeredAmount)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="grid min-w-[260px] gap-2">
                          <form action={approveCollectionAction}>
                            <input name="id" type="hidden" value={item.id} />
                            <button className="min-h-10 w-full rounded-md bg-[color:var(--accent)] px-3 text-xs font-semibold text-white hover:bg-[color:var(--accent-strong)]">
                              Aprobar
                            </button>
                          </form>
                          <form action={rejectCollectionAction} className="flex gap-2">
                            <input name="id" type="hidden" value={item.id} />
                            <input
                              className="min-h-10 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-2 text-xs outline-none focus:border-[color:var(--accent)]"
                              name="reason"
                              placeholder="Motivo"
                            />
                            <button className="min-h-10 rounded-md border border-[color:var(--border)] px-3 text-xs font-semibold hover:bg-[color:var(--panel-subtle)]">
                              Rechazar
                            </button>
                          </form>
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
