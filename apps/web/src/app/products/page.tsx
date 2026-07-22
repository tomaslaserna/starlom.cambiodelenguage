import type { ReactNode } from "react";
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
  Input,
  Toolbar,
} from "@/components/ui";
import { listProducts } from "@/lib/catalog";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { ProductPriceDetails } from "@/app/products/product-price-details";
import { sessionCanReadProducts } from "@/lib/route-auth";

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    mode?: string;
  }>;
};

type MetricTone = "accent" | "warning" | "danger" | "success";

const metricToneClasses: Record<
  MetricTone,
  { icon: string; value: string }
> = {
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

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.25 16.25 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 6h16M7 12h10m-7 6h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M7 3.75h7l3 3V20.25H7V3.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path d="M14 3.75v3h3M9.5 12h5m-5 3h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
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
  if (params.mode === "new") redirect("/pricing?mode=new-product");
  if (params.mode === "bulk") redirect("/stock?mode=bulk");
  const result = await listProducts({
    companyId: session.companyId,
    query: params.q,
    page: params.page,
    pageSize: "25",
  });
  const pageProductCount = result.data.length;
  const outOfStockCount = result.data.filter((product) => product.stockReal === 0).length;
  const negativeStockCount = result.data.filter((product) => product.stockReal < 0).length;
  const inventoryValue = result.data.reduce(
    (total, product) => total + Math.max(0, product.stockReal) * product.cost,
    0,
  );
  const pageDetail = `Página ${result.meta.page} · ${formatNumber(pageProductCount)} visibles`;

  return (
    <ModulePage
      active="stock"
      description="Inventario, costos y rentabilidad por cada lista de precios."
      session={session}
      title="Información de stock"
    >
      <div className="grid gap-4">
        <Toolbar
          ariaLabel="Búsqueda y acciones de productos"
          className="rounded-[10px] border-[#d9e2ef] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
        >
          <form
            action="/products"
            aria-label="Buscar productos"
            className="flex w-full flex-col gap-2 lg:flex-row lg:items-center"
          >
            <div className="relative min-w-0 flex-1">
              <label className="sr-only" htmlFor="products-query">
                Buscar producto
              </label>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#64748b]">
                <SearchIcon />
              </span>
              <Input
                autoComplete="off"
                className="h-11 w-full border-[#d9e2ef] bg-white pl-10 pr-4 shadow-[0_2px_8px_rgba(15,23,42,0.035)]"
                defaultValue={result.meta.query}
                id="products-query"
                name="q"
                placeholder="Buscar producto, código, categoría o proveedor..."
                type="search"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
              <Button className="h-11 min-h-11 px-4" leadingIcon={<FilterIcon />} type="submit">
                Buscar
              </Button>
              <ButtonLink className="h-11 min-h-11 px-4" href="/products" variant="ghost">
                Limpiar
              </ButtonLink>
              <ButtonLink
                aria-label="Abrir lista PDF de precios en una pestaña nueva"
                className="h-11 min-h-11 px-4"
                href="/api/pdfs/pricing/price-list?list=1"
                leadingIcon={<DocumentIcon />}
                prefetch={false}
                rel="noreferrer"
                target="_blank"
                variant="outline"
              >
                Lista PDF
              </ButtonLink>
            </div>
          </form>
        </Toolbar>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InventoryMetric
            detail={result.meta.query ? "Coinciden con el filtro actual" : "Activos en el catálogo"}
            icon={<ProductIcon />}
            label={result.meta.query ? "Productos encontrados" : "Total de productos"}
            tone="accent"
            value={formatNumber(result.meta.total)}
          />
          <InventoryMetric
            detail={pageDetail}
            icon={
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 7.75v5M12 16.25h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
            }
            label="Sin stock"
            tone="warning"
            value={formatNumber(outOfStockCount)}
          />
          <InventoryMetric
            detail={pageDetail}
            icon={
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
                <path d="M12 4v16m0 0-5-5m5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            }
            label="Stock negativo"
            tone="danger"
            value={formatNumber(negativeStockCount)}
          />
          <InventoryMetric
            detail={`Costo estimado · ${pageDetail.toLowerCase()}`}
            icon={<span className="text-xl font-bold">$</span>}
            label="Valor de inventario"
            tone="success"
            value={formatCurrency(inventoryValue)}
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
                        result.meta.query
                          ? "Ajustá la búsqueda para encontrar productos por nombre, código, categoría o proveedor."
                          : "Cuando existan productos cargados aparecerán en este listado paginado."
                      }
                      title={
                        result.meta.query
                          ? "No hay productos para la búsqueda actual"
                          : "No hay productos cargados"
                      }
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((product) => (
                  <DataTableRow className="hover:bg-[#f8fbff]" key={product.id}>
                    <DataTableCell className="px-4 py-2">
                      <div className="flex max-w-[390px] items-center gap-3">
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
                      <ProductPriceDetails prices={product.prices} />
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/products"
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
