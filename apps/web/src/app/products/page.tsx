import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { SectionTabs } from "@/components/section-tabs";
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
  StatCard,
  StatusBadge,
  Toolbar,
} from "@/components/ui";
import { listProducts } from "@/lib/catalog";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanReadProducts } from "@/lib/route-auth";

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    mode?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");

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
        <PageHeader
          description="Catalogo operativo de productos con costos y disponibilidad de stock desde la vista vigente."
          title="Productos"
        />

        <SectionTabs
          tabs={[
            { href: "/products", label: "Cambiar stock", active: !params.mode },
            { href: "/products?mode=new", label: "Nuevo stock", active: params.mode === "new" },
            { href: "/products?mode=bulk", label: "Carga masiva", active: params.mode === "bulk" },
          ]}
        />

        <Toolbar ariaLabel="Busqueda y acciones de productos">
          <form
            action="/products"
            aria-label="Busqueda"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto] lg:items-end"
          >
            <Field htmlFor="products-query" label="Buscar">
              <Input
                defaultValue={result.meta.query}
                id="products-query"
                name="q"
                placeholder="Producto, codigo, categoria o proveedor"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
            <ButtonLink
              aria-label="Abrir lista PDF de precios en una pestaña nueva"
              href="/api/pdfs/pricing/price-list?list=1"
              prefetch={false}
              rel="noreferrer"
              target="_blank"
              variant="secondary"
            >
              Lista PDF
            </ButtonLink>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            className="p-3"
            detail={
              result.meta.query
                ? `Coinciden con la busqueda actual - Pagina ${result.meta.page} de ${result.meta.totalPages} - ${result.meta.pageSize} por pagina`
                : `Total de productos cargados - Pagina ${result.meta.page} de ${result.meta.totalPages} - ${result.meta.pageSize} por pagina`
            }
            label="Productos encontrados"
            value={formatNumber(result.meta.total)}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado paginado de productos con costo y stock"
            className="rounded-none border-0 shadow-none"
            minWidth="1040px"
            tableLabel="Productos"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead>Codigo</DataTableHead>
                <DataTableHead>Categoria</DataTableHead>
                <DataTableHead>Proveedor</DataTableHead>
                <DataTableHead align="right">Costo</DataTableHead>
                <DataTableHead align="right">Real</DataTableHead>
                <DataTableHead align="right">Reservado</DataTableHead>
                <DataTableHead align="right">Disponible</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={8}>
                    <EmptyState
                      description={
                        result.meta.query
                          ? "Ajusta la busqueda para encontrar productos por nombre, codigo, categoria o proveedor."
                          : "Cuando existan productos cargados apareceran en este listado paginado."
                      }
                      title={
                        result.meta.query
                          ? "No hay productos para la busqueda actual"
                          : "No hay productos cargados"
                      }
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((product) => (
                  <DataTableRow key={product.id}>
                    <DataTableCell>
                      <div className="max-w-[300px] break-words font-medium">{product.name}</div>
                      <div className="mt-1 whitespace-nowrap font-mono text-xs text-[color:var(--muted)]">
                        ID interno {product.productId || product.id}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs">
                      {product.code || "-"}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="max-w-[180px] break-words">{product.category || "-"}</div>
                    </DataTableCell>
                    <DataTableCell className="text-[color:var(--muted)]">
                      <div className="max-w-[220px] break-words">{product.supplier || "-"}</div>
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatCurrency(product.cost)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatNumber(product.stockReal)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatNumber(product.reserved)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap">
                      <StatusBadge
                        aria-label={`Stock disponible: ${formatNumber(product.available)}`}
                        tone={product.available <= 0 ? "danger" : "neutral"}
                      >
                        {formatNumber(product.available)}
                      </StatusBadge>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/products"
            page={result.meta.page}
            query={result.meta.query}
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
