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
  Select,
  Toolbar,
} from "@/components/ui";
import { listSalePrices } from "@/lib/catalog";
import { listPriceLists } from "@/lib/pricing";
import { formatCurrency } from "@/lib/format";
import { localDateIso } from "@/lib/timezone";
import { isAdminRole, requireStaffSession } from "@/lib/auth";
import { PRODUCTS_CREATE_PERMISSION, sessionAllows, sessionCanReadProducts } from "@/lib/route-auth";
import { ProductImageCell } from "@/app/prices/product-image-cell";

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
  const canEditProducts = await sessionAllows(session, [PRODUCTS_CREATE_PERMISSION]);

  return (
    <ModulePage
      active="prices"
      description="Lista de precios por producto, una pestaña por cada lista activa."
      session={session}
      title="Lista de precios"
    >
      <div className="grid gap-4">
        <PageHeader
          description="Elegí una lista para ver sus precios netos, sin IVA. Buscá por producto o proveedor y exportá el PDF para el cliente."
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
                className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-bold leading-none transition-colors ${
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
            <Link
              className="inline-flex h-9 items-center rounded-full border border-dashed border-[#94a3b8] px-3 text-sm font-bold text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb]"
              href="/prices/parameters"
            >
              + Gestionar listas
            </Link>
          ) : null}
          {lists.length === 0 ? (
            <span className="text-sm text-[color:var(--muted)]">No hay listas activas todavía.</span>
          ) : null}
        </div>

        <Toolbar ariaLabel="Búsqueda y acciones de la lista de precios">
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <form
              action="/prices"
              aria-label="Buscar en la lista de precios"
              className="grid w-full gap-3 sm:grid-cols-[minmax(240px,1fr)_auto] sm:items-end lg:max-w-xl"
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
            </form>

            <div className="flex items-end gap-2">
              {activeList ? (
                <details className="relative">
                  <summary className="inline-flex h-[var(--control-height-md)] cursor-pointer list-none items-center rounded-[9px] border border-[#d9e2ef] bg-white px-4 text-sm font-bold text-[#334155] shadow-[var(--shadow-xs)] hover:border-[#2563eb]">
                    Exportar PDF
                  </summary>
                  <form
                    action="/api/pdfs/pricing/price-list"
                    className="absolute right-0 z-20 mt-2 grid w-[300px] gap-3 rounded-[10px] border border-[#d9e2ef] bg-white p-4 shadow-[var(--shadow-lg)]"
                    method="GET"
                    target="_blank"
                  >
                    <input name="list" type="hidden" value={activeList.id} />
                    <p className="erp-text-caption font-bold text-[#0f172a]">Exportar “{activeList.name}”</p>
                    <Field htmlFor="pdf-vigencia" label="Vigencia desde">
                      <Input defaultValue={localDateIso()} id="pdf-vigencia" name="vigencia" type="date" />
                    </Field>
                    <Field htmlFor="pdf-stock" label="Productos">
                      <Select defaultValue="todos" id="pdf-stock" name="stock">
                        <option value="todos">Todos</option>
                        <option value="con">Solo con stock</option>
                      </Select>
                    </Field>
                    <Field htmlFor="pdf-group" label="Agrupar por">
                      <Select defaultValue="categoria" id="pdf-group" name="groupBy">
                        <option value="categoria">Categoría</option>
                        <option value="proveedor">Proveedor</option>
                      </Select>
                    </Field>
                    <Field htmlFor="pdf-filter" label="Filtrar (opcional)">
                      <Input id="pdf-filter" name="filter" placeholder="Categoría o proveedor" />
                    </Field>
                    <Field htmlFor="pdf-iva" label="IVA a aplicar al exportar">
                      <Select defaultValue="21" id="pdf-iva" name="iva">
                        <option value="10.5">Sumar IVA 10,5%</option>
                        <option value="21">Sumar IVA 21%</option>
                      </Select>
                    </Field>
                    <Button type="submit">Generar PDF</Button>
                  </form>
                </details>
              ) : null}
              <ButtonLink href="/prices/new" variant="outline">
                Nuevo producto
              </ButtonLink>
            </div>
          </div>
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
                <DataTableHead>Imagen</DataTableHead>
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead>Código</DataTableHead>
                <DataTableHead>Categoría</DataTableHead>
                <DataTableHead>Proveedor</DataTableHead>
                <DataTableHead align="right">{activeList ? `${activeList.name} (neto)` : "Precio neto"}</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={6}>
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
                        <ProductImageCell canEdit={canEditProducts} imageUrl={product.imageUrl} productId={product.id} />
                      </DataTableCell>
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
