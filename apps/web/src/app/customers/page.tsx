import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { SearchBar } from "@/components/search-bar";
import { listCustomers } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";

type CustomersPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const result = await listCustomers({
    companyId: session.companyId,
    query: params.q,
    page: params.page,
    pageSize: "25",
  });

  return (
    <ModulePage
      active="database"
      description="Clientes consultados desde PostgreSQL con sesion Node y contexto multiempresa."
      session={session}
      title="Clientes"
    >
      <div className="grid gap-5">
        <div className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[1fr_auto] md:items-center">
          <SearchBar action="/customers" placeholder="Buscar por nombre, razon social, CUIT o telefono" query={result.meta.query} />
          <div className="rounded-md bg-[color:var(--panel-subtle)] px-3 py-2 text-sm">
            <span className="font-semibold">{formatNumber(result.meta.total)}</span>{" "}
            <span className="text-[color:var(--muted)]">clientes</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Identificacion</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Ubicacion</th>
                  <th className="px-4 py-3 font-semibold">Lista</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {result.data.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={6}>
                      No hay clientes para la busqueda actual.
                    </td>
                  </tr>
                ) : (
                  result.data.map((customer) => (
                    <tr className="border-t border-[color:var(--border)]" key={customer.id}>
                      <td className="px-4 py-4">
                        <div className="font-medium">{customer.name || "Sin nombre"}</div>
                        <div className="text-xs text-[color:var(--muted)]">{customer.businessName || customer.code || `ID ${customer.id}`}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs">
                        {customer.taxIdType || "ID"} {customer.taxId || "-"}
                      </td>
                      <td className="px-4 py-4">{customer.phone || "-"}</td>
                      <td className="px-4 py-4 text-[color:var(--muted)]">
                        {[customer.city, customer.province].filter(Boolean).join(", ") || "-"}
                      </td>
                      <td className="px-4 py-4">{customer.priceList || "-"}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs">
                          {customer.status || "Sin estado"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationLinks
            basePath="/customers"
            page={result.meta.page}
            query={result.meta.query}
            totalPages={result.meta.totalPages}
          />
        </div>
      </div>
    </ModulePage>
  );
}
