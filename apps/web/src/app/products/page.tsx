import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { SearchBar } from "@/components/search-bar";
import { SectionTabs } from "@/components/section-tabs";
import { listProducts } from "@/lib/catalog";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    mode?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const result = await listProducts({
    companyId: session.companyId,
    query: params.q,
    page: params.page,
    pageSize: "25",
  });

  return (
    <ModulePage
      active="stock"
      description="Catalogo y stock disponible consultados desde la vista PostgreSQL existente, respetando empresa_id."
      session={session}
      title="Productos"
    >
        <div className="grid gap-5">
          <SectionTabs
            tabs={[
              { href: "/products", label: "Cambiar stock", active: !params.mode },
              { href: "/products?mode=new", label: "Nuevo stock", active: params.mode === "new" },
              { href: "/products?mode=bulk", label: "Carga masiva", active: params.mode === "bulk" },
            ]}
          />

          <div className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[1fr_auto] md:items-center">
            <SearchBar action="/products" placeholder="Buscar por producto, codigo, categoria o proveedor" query={result.meta.query} />
          <div className="flex flex-wrap items-center gap-2">
            <a
              className="rounded-md border border-[color:var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[color:var(--panel-subtle)]"
              href="/api/pdfs/pricing/price-list?list=1"
              target="_blank"
            >
              Lista PDF
            </a>
            <div className="rounded-md bg-[color:var(--panel-subtle)] px-3 py-2 text-sm">
              <span className="font-semibold">{formatNumber(result.meta.total)}</span>{" "}
              <span className="text-[color:var(--muted)]">productos</span>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  <th className="px-4 py-3 font-semibold">Codigo</th>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-4 py-3 font-semibold">Proveedor</th>
                  <th className="px-4 py-3 text-right font-semibold">Costo</th>
                  <th className="px-4 py-3 text-right font-semibold">Real</th>
                  <th className="px-4 py-3 text-right font-semibold">Reservado</th>
                  <th className="px-4 py-3 text-right font-semibold">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {result.data.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={8}>
                      No hay productos para la busqueda actual.
                    </td>
                  </tr>
                ) : (
                  result.data.map((product) => (
                    <tr className="border-t border-[color:var(--border)]" key={product.id}>
                      <td className="px-4 py-4">
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-[color:var(--muted)]">ID interno {product.productId || product.id}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs">{product.code || "-"}</td>
                      <td className="px-4 py-4">{product.category || "-"}</td>
                      <td className="px-4 py-4 text-[color:var(--muted)]">{product.supplier || "-"}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(product.cost)}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(product.stockReal)}</td>
                      <td className="px-4 py-4 text-right">{formatNumber(product.reserved)}</td>
                      <td className="px-4 py-4 text-right">
                        <span
                          className={`rounded-md px-2 py-1 font-medium ${
                            product.available <= 0
                              ? "bg-[color:var(--danger)] text-white"
                              : "bg-[color:var(--panel-subtle)]"
                          }`}
                        >
                          {formatNumber(product.available)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationLinks
            basePath="/products"
            page={result.meta.page}
            query={result.meta.query}
            totalPages={result.meta.totalPages}
          />
        </div>
      </div>
    </ModulePage>
  );
}
