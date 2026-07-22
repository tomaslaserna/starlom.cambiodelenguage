import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  Button,
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
  Select,
  Textarea,
} from "@/components/ui";
import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import {
  bulkUpdateProductsAction,
  createProductAction,
  importProductCodesCsvAction,
  importProductsCsvAction,
} from "@/app/products/actions";
import { ProductPriceDetails } from "@/app/products/product-price-details";
import { ProductsToolbar } from "@/app/products/products-toolbar";
import { requireStaffSession } from "@/lib/auth";
import { listProducts } from "@/lib/catalog";
import { formatCurrency, formatNumber } from "@/lib/format";
import { listMargins } from "@/lib/pricing";
import { sessionCanReadProducts } from "@/lib/route-auth";

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    mode?: string;
    stock?: string;
    created?: string;
    inserted?: string;
    processed?: string;
    skipped?: string;
    updated?: string;
  }>;
};

type MetricTone = "accent" | "warning" | "danger" | "success";

const metricToneClasses: Record<MetricTone, { icon: string; value: string }> = {
  accent: {
    icon: "bg-[#eff6ff] text-[#2563eb]",
    value: "text-[#0f172a]",
  },
  warning: {
    icon: "bg-[#fff7e8] text-[#d97706]",
    value: "text-[#b45309]",
  },
  danger: {
    icon: "bg-[#fff1f2] text-[#dc2626]",
    value: "text-[#dc2626]",
  },
  success: {
    icon: "bg-[#ecfdf5] text-[#059669]",
    value: "text-[#0f172a]",
  },
};

function InventoryMetric({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: ReactNode;
  icon: ReactNode;
  label: ReactNode;
  tone: MetricTone;
  value: ReactNode;
}) {
  const toneClasses = metricToneClasses[tone];

  return (
    <section className="flex min-h-[94px] items-center gap-3 rounded-[10px] border border-[#d9e2ef] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneClasses.icon}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="erp-text-caption font-semibold text-[#64748b]">{label}</div>
        <div className={`mt-0.5 text-xl font-extrabold leading-tight tracking-[-0.02em] ${toneClasses.value}`}>
          {value}
        </div>
        <div className="erp-text-caption mt-1 truncate font-medium text-[#7c8aa0]">{detail}</div>
      </div>
    </section>
  );
}

function ProductIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="m12 3.5 7 3.75v9.5L12 20.5l-7-3.75v-9.5L12 3.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path d="m5.4 7.45 6.6 3.6 6.6-3.6M12 11.05v9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function stockBadgeClass(stock: number) {
  if (stock < 0) return "bg-[#fff1f2] text-[#dc2626] ring-[#fecdd3]";
  if (stock === 0) return "bg-[#fff7e8] text-[#c25b09] ring-[#fed7aa]";
  return "bg-[#ecfdf5] text-[#047857] ring-[#bbf7d0]";
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");

  const params = await searchParams;
  const [result, margins] = await Promise.all([
    listProducts({
      companyId: session.companyId,
      query: params.q,
      page: params.page,
      pageSize: "25",
      stockFilter: params.stock,
    }),
    listMargins(session.companyId),
  ]);
  const hasFilters = Boolean(result.meta.query || result.stockFilter !== "all");

  return (
    <ModulePage
      active="stock"
      description="Gestión del inventario y control del stock de productos y precios."
      session={session}
      title="Productos"
    >
      <div className="grid gap-4">
        <ProductsToolbar query={result.meta.query} stockFilter={result.stockFilter} />

        {params.mode === "new" ? (
          <Card>
            <CardHeader>
              <CardTitle>Nuevo producto</CardTitle>
              <CardDescription>Alta directa de productos nuevos y su stock inicial.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createProductAction} className="grid gap-4 lg:grid-cols-2">
                <Field htmlFor="product-name" label="Nombre" required>
                  <Input id="product-name" name="name" />
                </Field>
                <Field htmlFor="product-code" label="Categoría de precio" required>
                  <Select id="product-code" name="code">
                    {margins.map((margin) => (
                      <option key={margin.code} value={margin.code}>
                        {margin.code} - {margin.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="product-cost" label="Costo" required>
                  <Input id="product-cost" inputMode="decimal" name="cost" />
                </Field>
                <Field htmlFor="product-stock" label="Stock inicial">
                  <Input defaultValue="0" id="product-stock" inputMode="numeric" name="stock" />
                </Field>
                <Field htmlFor="product-provider" label="Proveedor">
                  <Input id="product-provider" name="provider" />
                </Field>
                <Field className="lg:col-span-2" htmlFor="product-description" label="Descripción">
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
                <CardDescription>Carga masiva del catálogo de productos.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={importProductsCsvAction} className="grid gap-3">
                  <Field htmlFor="products-csv" label="Archivo CSV">
                    <Input accept=".csv,text/csv" id="products-csv" name="csv_file" type="file" />
                  </Field>
                  <Button type="submit">Importar productos</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actualizar códigos CSV</CardTitle>
                <CardDescription>Actualización masiva de códigos desde archivo CSV.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={importProductCodesCsvAction} className="grid gap-3">
                  <Field htmlFor="codes-csv" label="Archivo CSV">
                    <Input accept=".csv,text/csv" id="codes-csv" name="csv_file" type="file" />
                  </Field>
                  <Button type="submit" variant="secondary">
                    Actualizar códigos
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actualización masiva JSON</CardTitle>
                <CardDescription>Edición directa de nombre, costo, descripción y stock.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={bulkUpdateProductsAction} className="grid gap-3">
                  <Field
                    description='Formato: [{"id":"uuid-del-producto","name":"Producto","cost":100,"stock":5}]'
                    htmlFor="bulk-json"
                    label="Productos JSON"
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InventoryMetric
            detail={hasFilters ? "Coinciden con los filtros actuales" : "Activos en el catálogo"}
            icon={<ProductIcon />}
            label={hasFilters ? "Productos encontrados" : "Total de productos"}
            tone="accent"
            value={formatNumber(result.summary.total)}
          />
          <InventoryMetric
            detail="Productos con 0 unidades"
            icon={
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 7.75v5M12 16.25h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
            }
            label="Sin stock"
            tone="warning"
            value={formatNumber(result.summary.outOfStock)}
          />
          <InventoryMetric
            detail="Requieren reposición"
            icon={
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path d="M12 4v16m0 0-5-5m5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            }
            label="Stock negativo"
            tone="danger"
            value={formatNumber(result.summary.negativeStock)}
          />
          <InventoryMetric
            detail="Costo total estimado"
            icon={<span className="text-xl font-bold">$</span>}
            label="Valor de inventario"
            tone="success"
            value={formatCurrency(result.summary.inventoryValue)}
          />
        </div>

        <Card className="overflow-hidden border-[#d9e2ef] shadow-[0_10px_30px_rgba(15,23,42,0.055)]">
          <DataTable
            caption="Listado paginado de productos con cantidad, costo, precios y márgenes"
            className="rounded-none border-0 shadow-none"
            minWidth="1080px"
            tableLabel="Productos"
          >
            <DataTableHeader className="bg-[#f8fafc] text-[#58677d]">
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[36%] px-4 py-2.5">Producto</DataTableHead>
                <DataTableHead className="px-4 py-2.5">Código</DataTableHead>
                <DataTableHead className="px-4 py-2.5">Categoría</DataTableHead>
                <DataTableHead className="px-4 py-2.5">Proveedor</DataTableHead>
                <DataTableHead align="center" className="px-4 py-2.5">Cantidad</DataTableHead>
                <DataTableHead align="right" className="px-4 py-2.5">Costo</DataTableHead>
                <DataTableHead align="center" className="px-4 py-2.5">Precios y margen</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState
                      description={
                        hasFilters
                          ? "Ajustá la búsqueda o los filtros para encontrar otros productos."
                          : "Cuando existan productos cargados aparecerán en este listado paginado."
                      }
                      title={hasFilters ? "No hay productos para los filtros actuales" : "No hay productos cargados"}
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((product) => (
                  <DataTableRow className="hover:bg-[#f8fbff]" key={product.id}>
                    <DataTableCell className="px-4 py-2">
                      <div className="flex max-w-[410px] items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#64748b] ring-1 ring-inset ring-[#e2e8f0]">
                          <ProductIcon />
                        </span>
                        <span className="break-words text-[13px] font-bold leading-[1.3] text-[#172033]">
                          {product.name}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap px-4 py-2 font-mono text-xs text-[#334155]">
                      {product.code || "-"}
                    </DataTableCell>
                    <DataTableCell className="px-4 py-2">
                      {product.category ? (
                        <span className="inline-flex max-w-[170px] rounded-md bg-[#eaf2ff] px-2.5 py-1 text-[11px] font-bold uppercase leading-none text-[#2563eb]">
                          <span className="truncate">{product.category}</span>
                        </span>
                      ) : (
                        <span className="text-[#94a3b8]">-</span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="px-4 py-2">
                      <div className={`max-w-[190px] truncate font-semibold ${product.supplier ? "text-[#2563eb]" : "text-[#94a3b8]"}`}>
                        {product.supplier || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell align="center" className="px-4 py-2">
                      <span
                        aria-label={`Cantidad en stock: ${formatNumber(product.stockReal)}`}
                        className={`inline-flex min-w-9 justify-center rounded-full px-2.5 py-1 font-mono text-xs font-bold leading-none ring-1 ring-inset ${stockBadgeClass(product.stockReal)}`}
                      >
                        {formatNumber(product.stockReal)}
                      </span>
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-4 py-2 font-mono text-xs font-semibold">
                      {formatCurrency(product.cost)}
                    </DataTableCell>
                    <DataTableCell align="center" className="px-4 py-2">
                      <ProductPriceDetails prices={product.prices} productName={product.name} />
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/products"
            extraParams={{ stock: result.stockFilter === "all" ? undefined : result.stockFilter }}
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
