import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  StatCard,
  StatusBadge,
  Textarea,
  Toolbar,
} from "@/components/ui";
import {
  bulkUpdateProductsAction,
  createProductAction,
  importProductCodesCsvAction,
  importProductsCsvAction,
} from "@/app/products/actions";
import { listProducts } from "@/lib/catalog";
import { fastOr } from "@/lib/fast-data";
import { formatCurrency, formatNumber } from "@/lib/format";
import { listMargins } from "@/lib/pricing";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanReadProducts } from "@/lib/route-auth";

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    mode?: string;
    created?: string;
    inserted?: string;
    processed?: string;
    skipped?: string;
    updated?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");

  const params = await searchParams;
  const [result, margins] = await Promise.all([
    fastOr(
      listProducts({
        companyId: session.companyId,
        query: params.q,
        page: params.page,
        pageSize: "25",
      }),
      {
        data: [],
        meta: {
          companyId: session.companyId,
          query: params.q?.trim() ?? "",
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 1,
        },
      },
    ),
    fastOr(listMargins(session.companyId), []),
  ]);

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

        {params.mode === "new" ? (
          <Card>
            <CardHeader>
              <CardTitle>Nuevo producto</CardTitle>
              <CardDescription>
                Alta directa en React para productos nuevos y stock inicial.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createProductAction} className="grid gap-4 lg:grid-cols-2">
                <Field htmlFor="product-name" label="Nombre" required>
                  <Input id="product-name" name="name" />
                </Field>
                <Field htmlFor="product-code" label="Categoria de precio" required>
                  <Select id="product-code" name="code">
                    {margins.map((margin) => (
                      <option key={margin.code} value={margin.code}>
                        {margin.code} - {margin.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="product-cost" label="Costo" required>
                  <Input id="product-cost" name="cost" inputMode="decimal" />
                </Field>
                <Field htmlFor="product-stock" label="Stock inicial">
                  <Input id="product-stock" name="stock" defaultValue="0" inputMode="numeric" />
                </Field>
                <Field htmlFor="product-provider" label="Proveedor">
                  <Input id="product-provider" name="provider" />
                </Field>
                <Field className="lg:col-span-2" htmlFor="product-description" label="Descripcion">
                  <Textarea id="product-description" name="description" rows={4} />
                </Field>
                <div className="lg:col-span-2">
                  <Button type="submit">Crear producto</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {params.mode === "bulk" ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Importar productos CSV</CardTitle>
                <CardDescription>Carga masiva del catalogo de productos.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={importProductsCsvAction} className="grid gap-3">
                  <Field htmlFor="products-csv" label="Archivo CSV">
                    <Input id="products-csv" name="csv_file" type="file" accept=".csv,text/csv" />
                  </Field>
                  <Button type="submit">Importar productos</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actualizar codigos CSV</CardTitle>
                <CardDescription>Actualizacion masiva de codigos desde archivo CSV.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={importProductCodesCsvAction} className="grid gap-3">
                  <Field htmlFor="codes-csv" label="Archivo CSV">
                    <Input id="codes-csv" name="csv_file" type="file" accept=".csv,text/csv" />
                  </Field>
                  <Button type="submit" variant="secondary">
                    Actualizar codigos
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actualizacion masiva JSON</CardTitle>
                <CardDescription>Edicion directa de nombre, costo, descripcion y stock.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={bulkUpdateProductsAction} className="grid gap-3">
                  <Field
                    htmlFor="bulk-json"
                    label="Productos JSON"
                    description='Formato: [{"id":1,"name":"Producto","cost":100,"stock":5,"description":""}]'
                  >
                    <Textarea id="bulk-json" name="itemsJson" rows={6} />
                  </Field>
                  <Button type="submit" variant="secondary">
                    Aplicar cambios
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : null}

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
