import { redirect } from "next/navigation";
import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Toolbar,
} from "@/components/ui";
import { listSalePrices } from "@/lib/catalog";
import { listPriceLists } from "@/lib/pricing";
import { formatCurrency } from "@/lib/format";
import { isAdminRole, requireStaffSession } from "@/lib/auth";
import { sessionCanReadProducts } from "@/lib/route-auth";
import { createPriceListAction } from "@/app/prices/actions";

type PricesPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    list?: string;
  }>;
};

export default async function PricesPage({ searchParams }: PricesPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");

  const params = await searchParams;
  const [lists, result] = await Promise.all([
    listPriceLists(session.companyId),
    listSalePrices({ companyId: session.companyId, query: params.q, page: params.page, pageSize: "25" }),
  ]);

  const requestedListId = Number(params.list);
  const activeList =
    lists.find((list) => list.id === requestedListId) ?? lists[0] ?? null;
  const canEdit = isAdminRole(session.role);

  return (
    <ModulePage
      active="prices"
      description="Lista de precios por producto, una pestaña por cada lista activa."
      session={session}
      title="Lista de precios"
    >
      <div className="grid gap-4">
        <PageHeader
          description="Elegí una lista para ver sus precios finales. Buscá por producto o proveedor y exportá el PDF para el cliente."
          moduleIntro
          title="Lista de precios"
        />

        {/* Pestañas de listas */}
        <div className="flex flex-wrap items-center gap-2">
          {lists.map((list) => {
            const isActive = activeList?.id === list.id;
            const query = new URLSearchParams();
            query.set("list", String(list.id));
            if (result.meta.query) query.set("q", result.meta.query);
            return (
              <Link
                className={`h-9 rounded-full border px-4 text-sm font-bold transition-colors ${
                  isActive
                    ? "border-[#2563eb] bg-[#2563eb] text-white"
                    : "border-[#d9e2ef] bg-white text-[#334155] hover:border-[#2563eb]"
                }`}
                href={`/prices?${query.toString()}`}
                key={list.id}
              >
                {list.name}
              </Link>
            );
          })}
          {canEdit ? (
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center rounded-full border border-dashed border-[#94a3b8] px-3 text-sm font-bold text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb]">
                + Nueva lista
              </summary>
              <form
                action={createPriceListAction}
                className="absolute left-0 z-20 mt-2 flex items-end gap-2 rounded-[10px] border border-[#d9e2ef] bg-white p-3 shadow-[var(--shadow-lg)]"
              >
                <Field htmlFor="new-list-name" label="Nombre de la lista">
                  <Input id="new-list-name" maxLength={50} name="name" placeholder="Ej: Mayorista" required />
                </Field>
                <Button type="submit">Crear</Button>
              </form>
            </details>
          ) : null}
          {lists.length === 0 ? (
            <span className="text-sm text-[color:var(--muted)]">No hay listas activas todavía.</span>
          ) : null}
        </div>

        <Toolbar ariaLabel="Búsqueda y acciones de la lista de precios">
          <form
            action="/prices"
            aria-label="Buscar en la lista de precios"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto] lg:items-end"
          >
            {activeList ? <input name="list" type="hidden" value={activeList.id} /> : null}
            <Field htmlFor="prices-query" label="Buscar">
              <Input
                defaultValue={result.meta.query}
                id="prices-query"
                name="q"
                placeholder="Producto, código, categoría o proveedor"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
            <ButtonLink
              aria-label={`Exportar la lista ${activeList?.name ?? ""} en PDF`}
              href={activeList ? `/api/pdfs/pricing/price-list?list=${activeList.id}` : "#"}
              prefetch={false}
              rel="noreferrer"
              target="_blank"
              variant="secondary"
            >
              Exportar PDF
            </ButtonLink>
            <ButtonLink href="/prices/new" variant="outline">
              Nuevo producto
            </ButtonLink>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption={`Precios de la lista ${activeList?.name ?? ""}`}
            className="rounded-none border-0 shadow-none"
            minWidth="880px"
            tableLabel="Lista de precios"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead>Código</DataTableHead>
                <DataTableHead>Categoría</DataTableHead>
                <DataTableHead>Proveedor</DataTableHead>
                <DataTableHead align="right">{activeList?.name ?? "Precio"}</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState
                      description={
                        result.meta.query
                          ? "Ajustá la búsqueda para encontrar productos por nombre, código, categoría o proveedor."
                          : "Cuando existan productos con costo y márgenes cargados aparecerán sus precios acá."
                      }
                      title={
                        result.meta.query ? "No hay productos para la búsqueda actual" : "No hay precios para mostrar"
                      }
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((product) => {
                  const price = activeList ? product.prices[activeList.name] : undefined;
                  return (
                    <DataTableRow key={product.id}>
                      <DataTableCell>
                        <div className="max-w-[360px] break-words font-medium">{product.name}</div>
                      </DataTableCell>
                      <DataTableCell className="whitespace-nowrap font-mono text-xs">
                        {product.code || "-"}
                      </DataTableCell>
                      <DataTableCell>
                        <div className="max-w-[180px] break-words text-[color:var(--muted)]">
                          {product.category || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="max-w-[200px] break-words text-[color:var(--muted)]">
                          {product.supplier || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-sm font-bold text-[#0f172a]">
                        {price ? formatCurrency(price) : "-"}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/prices"
            extraParams={{ list: activeList ? String(activeList.id) : undefined }}
            itemLabel="productos"
            page={result.meta.page}
            pageSize={result.meta.pageSize}
            query={result.meta.query}
            totalItems={result.meta.total}
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
