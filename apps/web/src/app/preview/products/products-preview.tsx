"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Input,
  PageHeader,
  Toolbar,
} from "@/components/ui";

type StockFilter = "all" | "available" | "empty" | "negative";

type PreviewProduct = {
  id: number;
  name: string;
  code: string;
  category: string;
  supplier: string;
  stock: number;
  cost: number;
};

const SAMPLE_PRODUCTS: PreviewProduct[] = [
  { id: 1, name: "ABRILLANTADOR LAVAVAJILLA X 1 LT", code: "1.1001", category: "Limpieza", supplier: "MARALIMM", stock: 0, cost: 9710 },
  { id: 2, name: "ABRILLANTADOR P/PISOS X 5 LTS", code: "1.1002", category: "Limpieza", supplier: "MARALIMM", stock: 0, cost: 2899 },
  { id: 3, name: "ÁCIDO ACÉTICO (VINAGRE) X 5 LTS", code: "1.1156", category: "Limpieza", supplier: "Sin proveedor", stock: 0, cost: 3587 },
  { id: 4, name: "ÁCIDO MURIÁTICO X 5 LTS", code: "1.14003", category: "Limpieza", supplier: "CERROCLOR", stock: 3, cost: 4021 },
  { id: 5, name: "ACONDICIONADOR P/PISOS ECOQUIM X 5 LTS", code: "1.1003", category: "Limpieza", supplier: "MARALIMM", stock: 12, cost: 3658 },
  { id: 6, name: "ACONDICIONADOR P/PISOS X 5 LTS", code: "1.1004", category: "Limpieza", supplier: "MARALIMM", stock: 0, cost: 4865 },
  { id: 7, name: "ACONDICIONADOR PARA CABELLOS X 5 LTS", code: "1.1005", category: "Higiene", supplier: "MARALIMM", stock: -3, cost: 4273 },
  { id: 8, name: "ACONDICIONADOR SEDAL (6X24)", code: "1.1006", category: "Higiene", supplier: "MARALIMM", stock: 6, cost: 3614 },
  { id: 9, name: "ADAPTADOR PARA JUMBO", code: "1.1007", category: "Accesorios", supplier: "MARALIMM", stock: 18, cost: 558 },
  { id: 10, name: "AEROSOL SAPHIRUS", code: "1.3080", category: "Aromatización", supplier: "SAPHIRUS", stock: -23, cost: 4440 },
  { id: 11, name: "AFAKIT CLORO EN POLVO X 25 GR P/5LTS", code: "1.17002", category: "Limpieza", supplier: "MARALIMM", stock: 0, cost: 1560 },
];

const PRICE_LISTS = [
  { name: "Lista 1 · Minorista", margin: 30 },
  { name: "Lista 2 · Ancla", margin: 35 },
  { name: "Lista 3 · Mayorista", margin: 40 },
  { name: "Lista 4 · Especial", margin: 45 },
  { name: "Lista 5 · Distribuidor", margin: 50 },
];

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  currency: "ARS",
  maximumFractionDigits: 0,
  style: "currency",
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function ProductIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m12 3.5 7 3.75v9.5L12 20.5l-7-3.75v-9.5L12 3.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="m5.4 7.45 6.6 3.6 6.6-3.6M12 11.05v9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
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
      <path d="M4 6h16M7 12h10m-7 6h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M3.5 12s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function stockBadgeClass(stock: number) {
  if (stock < 0) return "bg-[#fff1f2] text-[#dc2626] ring-[#fecdd3]";
  if (stock === 0) return "bg-[#fff7e8] text-[#c25b09] ring-[#fed7aa]";
  return "bg-[#ecfdf5] text-[#047857] ring-[#bbf7d0]";
}

function PreviewMetric({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "accent" | "warning" | "danger" | "success";
  value: string;
}) {
  const toneClasses = {
    accent: "bg-[#eff6ff] text-[#2563eb]",
    warning: "bg-[#fff7e8] text-[#d97706]",
    danger: "bg-[#fff1f2] text-[#dc2626]",
    success: "bg-[#ecfdf5] text-[#059669]",
  }[tone];

  return (
    <section className="flex min-h-[94px] items-center gap-3 rounded-[12px] border border-[#dbe3ec] bg-white px-4 py-3 shadow-[0_7px_20px_rgba(15,23,42,0.035)]">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${toneClasses}`}>
        {tone === "success" ? <span className="text-xl font-bold">$</span> : <ProductIcon />}
      </span>
      <div className="min-w-0">
        <div className="erp-text-caption font-semibold text-[#64748b]">{label}</div>
        <div className="mt-0.5 text-xl font-extrabold leading-tight tracking-[-0.02em] text-[#0f172a]">{value}</div>
        <div className="erp-text-caption mt-1 truncate font-medium text-[#7c8aa0]">{detail}</div>
      </div>
    </section>
  );
}

export function ProductsPreview() {
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PreviewProduct | null>(null);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return SAMPLE_PRODUCTS.filter((product) => {
      const matchesText =
        !normalizedQuery ||
        [product.name, product.code, product.category, product.supplier]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(normalizedQuery);
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "available" && product.stock > 0) ||
        (stockFilter === "empty" && product.stock === 0) ||
        (stockFilter === "negative" && product.stock < 0);
      return matchesText && matchesStock;
    });
  }, [query, stockFilter]);

  const inventoryValue = filteredProducts.reduce(
    (total, product) => total + Math.max(0, product.stock) * product.cost,
    0,
  );
  const emptyStock = filteredProducts.filter((product) => product.stock === 0).length;
  const negativeStock = filteredProducts.filter((product) => product.stock < 0).length;

  function clearFilters() {
    setQuery("");
    setStockFilter("all");
  }

  return (
    <main className="min-h-screen bg-[#f3f6fb] px-3 py-4 text-[#172033] sm:px-5 lg:px-8 lg:py-7">
      <div className="mx-auto grid w-full max-w-[1680px] gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-[#1e40af] shadow-[0_4px_14px_rgba(37,99,235,0.06)]">
          <div>
            <strong className="block text-sm font-extrabold">Vista de muestra local</strong>
            <span className="erp-text-caption">Datos ficticios: no usa credenciales, no consulta la base y no guarda cambios.</span>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold ring-1 ring-inset ring-[#bfdbfe]">Solo localhost</span>
        </div>

        <PageHeader
          actions={
            <div className="flex flex-wrap gap-2">
              <Button disabled type="button" variant="outline">Exportar</Button>
              <Button disabled type="button">Nuevo producto</Button>
            </div>
          }
          description="Gestión del inventario y control del stock de productos y precios."
          title="Productos"
        />

        <Toolbar ariaLabel="Búsqueda y filtros de la muestra" className="p-3">
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="preview-products-query">Buscar producto</label>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#64748b]"><SearchIcon /></span>
            <Input
              autoComplete="off"
              className="h-11 w-full bg-white pl-10 pr-4"
              id="preview-products-query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto, código, categoría o proveedor..."
              type="search"
              value={query}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button leadingIcon={<FilterIcon />} onClick={() => setFiltersOpen((current) => !current)} type="button" variant="outline">
              Filtros{stockFilter === "all" ? "" : " · 1"}
            </Button>
            <Button onClick={clearFilters} type="button" variant="ghost">Limpiar</Button>
          </div>
        </Toolbar>

        {filtersOpen ? (
          <Card className="grid gap-3 p-4 sm:grid-cols-[minmax(220px,320px)_1fr] sm:items-end">
            <label className="grid gap-1.5 text-sm font-semibold text-[#334155]">
              Estado de stock
              <select
                className="h-11 rounded-[10px] border border-[#cbd5e1] bg-white px-3 text-sm text-[#172033] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
                onChange={(event) => setStockFilter(event.target.value as StockFilter)}
                value={stockFilter}
              >
                <option value="all">Todos los productos</option>
                <option value="available">Con disponibilidad</option>
                <option value="empty">Sin stock</option>
                <option value="negative">Stock negativo</option>
              </select>
            </label>
            <p className="erp-text-body-sm text-[#64748b]">El filtro y el buscador funcionan sobre estos datos ficticios para que puedas evaluar espacios, simetría y legibilidad.</p>
          </Card>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric detail="Coinciden con los filtros actuales" label="Productos visibles" tone="accent" value={String(filteredProducts.length)} />
          <PreviewMetric detail="Productos con 0 unidades" label="Sin stock" tone="warning" value={String(emptyStock)} />
          <PreviewMetric detail="Requieren reposición" label="Stock negativo" tone="danger" value={String(negativeStock)} />
          <PreviewMetric detail="Costo total estimado" label="Valor inventario" tone="success" value={formatCurrency(inventoryValue)} />
        </div>

        <Card className="overflow-hidden border-[#d9e2ef] shadow-[0_10px_30px_rgba(15,23,42,0.055)]">
          <DataTable caption="Muestra local de la tabla de productos" className="rounded-none border-0 shadow-none" minWidth="1080px" tableLabel="Productos de muestra">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[36%]">Producto</DataTableHead>
                <DataTableHead>Código</DataTableHead>
                <DataTableHead>Categoría</DataTableHead>
                <DataTableHead>Proveedor</DataTableHead>
                <DataTableHead align="center">Cantidad</DataTableHead>
                <DataTableHead align="right">Costo</DataTableHead>
                <DataTableHead align="center">Precios y margen</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {filteredProducts.length ? filteredProducts.map((product) => (
                <DataTableRow className="hover:bg-[#f8fbff]" key={product.id}>
                  <DataTableCell>
                    <div className="flex max-w-[410px] items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1f5f9] text-[#64748b] ring-1 ring-inset ring-[#e2e8f0]"><ProductIcon /></span>
                      <span className="break-words text-[13px] font-bold leading-[1.3] text-[#172033]">{product.name}</span>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="whitespace-nowrap font-mono text-xs text-[#334155]">{product.code}</DataTableCell>
                  <DataTableCell>
                    <span className="inline-flex max-w-[170px] rounded-md bg-[#eaf2ff] px-2.5 py-1 text-[11px] font-bold uppercase leading-none text-[#2563eb]">
                      <span className="truncate">{product.category}</span>
                    </span>
                  </DataTableCell>
                  <DataTableCell>
                    <span className={product.supplier === "Sin proveedor" ? "text-[#94a3b8]" : "font-semibold text-[#2563eb]"}>{product.supplier}</span>
                  </DataTableCell>
                  <DataTableCell align="center">
                    <span className={`inline-flex min-w-9 justify-center rounded-full px-2.5 py-1 font-mono text-xs font-bold leading-none ring-1 ring-inset ${stockBadgeClass(product.stock)}`}>{product.stock}</span>
                  </DataTableCell>
                  <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs font-semibold">{formatCurrency(product.cost)}</DataTableCell>
                  <DataTableCell align="center">
                    <Button leadingIcon={<EyeIcon />} onClick={() => setSelectedProduct(product)} size="sm" type="button" variant="outline">Ver precios (5)</Button>
                  </DataTableCell>
                </DataTableRow>
              )) : (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell className="py-10 text-center text-[#64748b]" colSpan={7}>No hay productos que coincidan con la búsqueda.</DataTableCell>
                </DataTableRow>
              )}
            </DataTableBody>
          </DataTable>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8edf3] bg-white px-5 py-3">
            <span className="erp-text-caption text-[#64748b]">Mostrando {filteredProducts.length} productos ficticios</span>
            <div className="flex items-center gap-2">
              <span className="rounded-[9px] border border-[#dbe3ec] bg-white px-3 py-2 text-xs font-semibold text-[#334155]">25 por página</span>
              <span className="flex h-9 min-w-9 items-center justify-center rounded-[9px] bg-[#2563eb] px-3 text-sm font-bold text-white">1</span>
            </div>
          </div>
        </Card>
      </div>

      {selectedProduct ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0f172a]/45 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProduct(null)}>
          <section aria-labelledby="preview-price-title" aria-modal="true" className="w-full max-w-[520px] rounded-[14px] border border-[#dbe3ec] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]" role="dialog">
            <header className="flex items-start justify-between gap-4 border-b border-[#e8edf3] px-5 py-4">
              <div>
                <p className="erp-text-caption font-bold uppercase text-[#2563eb]">Precios de muestra</p>
                <h2 className="mt-1 text-lg font-extrabold text-[#0f172a]" id="preview-price-title">{selectedProduct.name}</h2>
              </div>
              <button aria-label="Cerrar detalle" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dbe3ec] text-xl text-[#64748b] hover:bg-[#f8fafc]" onClick={() => setSelectedProduct(null)} type="button">×</button>
            </header>
            <div className="grid gap-2 p-5">
              {PRICE_LISTS.map((list) => {
                const price = Math.round(selectedProduct.cost * (1 + list.margin / 100));
                return (
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-[10px] border border-[#e2e8f0] px-4 py-3" key={list.name}>
                    <span className="text-sm font-semibold text-[#334155]">{list.name}</span>
                    <span className="font-mono text-sm font-bold text-[#0f172a]">{formatCurrency(price)}</span>
                    <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-xs font-bold text-[#047857]">{list.margin}%</span>
                  </div>
                );
              })}
            </div>
            <footer className="flex justify-end border-t border-[#e8edf3] px-5 py-4">
              <Button onClick={() => setSelectedProduct(null)} type="button">Cerrar</Button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
