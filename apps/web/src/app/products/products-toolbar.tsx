"use client";

import { useState } from "react";
import { Button, ButtonLink, Card, Input, Select, Toolbar } from "@/components/ui";
import type { ProductStockFilter } from "@/lib/catalog";

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

function DocumentIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M7 3.75h7l3 3V20.25H7V3.75Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M14 3.75v3h3M9.5 12h5m-5 3h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

export function ProductsToolbar({
  query,
  stockFilter,
}: {
  query: string;
  stockFilter: ProductStockFilter;
}) {
  const [filtersOpen, setFiltersOpen] = useState(stockFilter !== "all");

  return (
    <div className="grid gap-3">
      <Toolbar
        ariaLabel="Búsqueda y filtros de productos"
        className="rounded-[10px] border-[#d9e2ef] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]"
      >
        <form action="/products" className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
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
              defaultValue={query}
              id="products-query"
              name="q"
              placeholder="Buscar producto, código, categoría o proveedor..."
              type="search"
            />
            {stockFilter !== "all" ? <input name="stock" type="hidden" value={stockFilter} /> : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button type="submit">
              Buscar
            </Button>
            <Button
              aria-controls="products-stock-filters"
              aria-expanded={filtersOpen}
              leadingIcon={<FilterIcon />}
              onClick={() => setFiltersOpen((current) => !current)}
              type="button"
              variant="outline"
            >
              Filtros{stockFilter === "all" ? "" : " · 1"}
            </Button>
            <ButtonLink href="/products" variant="ghost">
              Limpiar
            </ButtonLink>
            <ButtonLink
              aria-label="Abrir lista PDF de precios en una pestaña nueva"
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

      {filtersOpen ? (
        <Card className="p-4" id="products-stock-filters">
          <form action="/products" className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_1fr_auto] sm:items-end">
            {query ? <input name="q" type="hidden" value={query} /> : null}
            <label className="grid gap-1.5 text-sm font-semibold text-[#334155]" htmlFor="products-stock-filter">
              Estado de stock
              <Select defaultValue={stockFilter} id="products-stock-filter" name="stock">
                <option value="all">Todos los productos</option>
                <option value="available">Con disponibilidad</option>
                <option value="empty">Sin stock</option>
                <option value="negative">Stock negativo</option>
              </Select>
            </label>
            <p className="erp-text-body-sm text-[#64748b]">
              Podés combinar el estado de stock con la búsqueda por nombre, código, categoría o proveedor.
            </p>
            <Button leadingIcon={<FilterIcon />} type="submit">
              Aplicar
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
