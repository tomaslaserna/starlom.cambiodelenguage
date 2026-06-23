import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { SearchBar } from "@/components/search-bar";
import { listSuppliers } from "@/lib/catalog-management";
import { requireStaffSession } from "@/lib/auth";

type SuppliersPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const result = await listSuppliers({
    companyId: session.companyId,
    query: params.q,
    page: params.page,
    pageSize: "25",
  });

  return (
    <ModulePage
      active="database"
      description="Base de proveedores migrada a Node."
      session={session}
      title="Proveedores"
    >
      <div className="grid gap-5">
        <div className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[1fr_auto] md:items-center">
          <SearchBar action="/suppliers" placeholder="Buscar proveedor, contacto, telefono o email" query={result.meta.query} />
          <div className="rounded-md bg-[color:var(--panel-subtle)] px-3 py-2 text-sm">
            <span className="font-semibold">{result.meta.total}</span>{" "}
            <span className="text-[color:var(--muted)]">proveedores</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Proveedor</th>
                <th className="px-4 py-3 font-semibold">Contacto</th>
                <th className="px-4 py-3 font-semibold">Telefono</th>
                <th className="px-4 py-3 font-semibold">Email</th>
              </tr>
            </thead>
            <tbody>
              {result.data.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={4}>
                    No hay proveedores para la busqueda actual.
                  </td>
                </tr>
              ) : (
                result.data.map((supplier) => (
                  <tr className="border-t border-[color:var(--border)]" key={supplier.id}>
                    <td className="px-4 py-4 font-medium">{supplier.name}</td>
                    <td className="px-4 py-4">{supplier.contact || "-"}</td>
                    <td className="px-4 py-4">{supplier.phone || "-"}</td>
                    <td className="px-4 py-4">{supplier.email || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <PaginationLinks
            basePath="/suppliers"
            page={result.meta.page}
            query={result.meta.query}
            totalPages={result.meta.totalPages}
          />
        </div>
      </div>
    </ModulePage>
  );
}
