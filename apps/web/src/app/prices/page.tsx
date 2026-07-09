import { redirect } from "next/navigation";
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
  StatCard,
  Toolbar,
} from "@/components/ui";
import { listSalePrices } from "@/lib/catalog";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanReadProducts } from "@/lib/route-auth";

type PricesPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

export default async function PricesPage({ searchParams }: PricesPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");

  const params = await searchParams;
  const result = await listSalePrices({
    companyId: session.companyId,
    query: params.q,
    page: params.page,
    pageSize: "25",
  });

  const columnCount = 3 + result.lists.length;

  return (
    <ModulePage
      active="database"
      description="Precios de venta por producto para cada lista activa, calculados sobre el costo y los multiplicadores vigentes."
      session={session}
      title="Precios"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Precios de venta finales por lista, derivados del costo del producto y su margen."
          moduleIntro
          title="Precios de venta"
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Productos" value={formatNumber(result.meta.total)} />
          <StatCard label="Listas activas" value={result.lists.length} />
        </div>

        <Toolbar ariaLabel="Busqueda de precios">
          <form
            action="/prices"
            aria-label="Busqueda"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto] lg:items-end"
          >
            <Field htmlFor="prices-query" label="Buscar">
              <Input
                defaultValue={result.meta.query}
                id="prices-query"
                name="q"
                placeholder="Producto, codigo o categoria"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
            <ButtonLink
              aria-label="Abrir lista de precios en PDF"
              href="/api/pdfs/pricing/price-list?list=2"
              prefetch={false}
              rel="noreferrer"
              target="_blank"
              variant="secondary"
            >
              Lista PDF
            </ButtonLink>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Precios de venta por producto y lista"
            className="rounded-none border-0 shadow-none"
            minWidth={`${640 + result.lists.length * 120}px`}
            tableLabel="Precios"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead>Codigo</DataTableHead>
                <DataTableHead align="right">Costo</DataTableHead>
                {result.lists.map((list) => (
                  <DataTableHead align="right" key={list}>
                    {list}
                  </DataTableHead>
                ))}
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={columnCount}>
                    <EmptyState
                      description={
                        result.meta.query
                          ? "Ajusta la busqueda para encontrar productos por nombre, codigo o categoria."
                          : "Cuando existan productos con costo y margenes cargados apareceran sus precios aca."
                      }
                      title={
                        result.meta.query
                          ? "No hay productos para la busqueda actual"
                          : "No hay precios para mostrar"
                      }
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((product) => (
                  <DataTableRow key={product.id}>
                    <DataTableCell>
                      <div className="max-w-[320px] break-words font-medium">{product.name}</div>
                      {product.category ? (
                        <div className="mt-1 text-xs text-[color:var(--muted)]">{product.category}</div>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs">
                      {product.code || "-"}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs text-[color:var(--muted)]">
                      {formatCurrency(product.cost)}
                    </DataTableCell>
                    {result.lists.map((list) => (
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs" key={list}>
                        {product.prices[list] ? formatCurrency(product.prices[list]) : "-"}
                      </DataTableCell>
                    ))}
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/prices"
            page={result.meta.page}
            query={result.meta.query}
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
