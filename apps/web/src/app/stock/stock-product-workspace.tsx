"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, SearchableSelect } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { InventoryProduct } from "@/lib/inventory";
import { StockAdjustmentDialog } from "@/app/stock/stock-adjustment-dialog";

type StockProductWorkspaceProps = {
  action: (formData: FormData) => void | Promise<void>;
  canEdit: boolean;
  idempotencyKey: string;
};

export function StockProductWorkspace({ action, canEdit, idempotencyKey }: StockProductWorkspaceProps) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [productId, setProductId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const selectedProduct = products.find((product) => product.id === productId) ?? null;
  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        searchText: `${product.code} ${product.categoryCode} ${product.supplier}`,
      })),
    [products],
  );

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void fetch(`/api/stock/products?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = (await response.json()) as { data?: InventoryProduct[] };
          if (response.ok) setProducts(payload.data ?? []);
        })
        .catch(() => undefined);
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [searchTerm]);

  function selectProduct(nextProductId: string) {
    setProductId(nextProductId);
    setShowDetail(!canEdit && Boolean(nextProductId));
    setDialogOpen(canEdit && Boolean(nextProductId));
  }

  function updateSearchTerm(nextSearchTerm: string) {
    setSearchTerm(nextSearchTerm);
    if (nextSearchTerm.trim().length < 2) setProducts([]);
  }

  return (
    <>
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Buscar producto</CardTitle>
          <CardDescription>
            Elegí un producto y la modificación de stock se abrirá automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid items-end gap-4 lg:grid-cols-2">
            <Field htmlFor="stock-workspace-product" label="Producto" required>
              <SearchableSelect
                compactOptions
                id="stock-workspace-product"
                options={productOptions}
                emptyMessage={searchTerm.trim().length < 2 ? "Escribí al menos 2 letras para buscar" : "No hay coincidencias"}
                placeholder="Buscar por nombre, codigo o proveedor"
                value={productId}
                onChange={selectProduct}
                onSearchChange={updateSearchTerm}
              />
            </Field>
            <div className="grid gap-1.5">
              <div className="text-sm font-semibold">Acción</div>
              {selectedProduct ? (
                <div
                  aria-label="Acción del producto"
                  className={`grid gap-2 ${canEdit ? "grid-cols-2" : "grid-cols-1"}`}
                  role="group"
                >
                  {canEdit ? (
                    <Button
                      aria-haspopup="dialog"
                      className="w-full"
                      onClick={() => setDialogOpen(true)}
                      variant="primary"
                    >
                      Modificar stock
                    </Button>
                  ) : null}
                  <Button
                    aria-pressed={showDetail}
                    className="w-full"
                    onClick={() => setShowDetail((current) => !current)}
                    variant={showDetail ? "primary" : "outline"}
                  >
                    Ver detalle
                  </Button>
                </div>
              ) : (
                <div
                  aria-disabled="true"
                  className="flex min-h-[var(--control-height-md)] items-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] bg-[color:var(--panel-muted)] px-3 text-sm text-[color:var(--muted)]"
                >
                  Disponible al elegir un producto
                </div>
              )}
            </div>
          </div>

          {selectedProduct && showDetail ? (
            <div
              className="grid gap-4 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4"
            >
              <div className="grid overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--panel)] sm:grid-cols-2">
                <div className="min-w-0 border-b border-[color:var(--border)] p-3 sm:border-b-0 sm:border-r">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Producto</div>
                  <div className="mt-1 truncate text-base font-semibold">{selectedProduct.name}</div>
                </div>
                <div className="p-3 sm:text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Stock actual</div>
                  <div className="mt-1 text-base font-semibold">{formatNumber(selectedProduct.stock)}</div>
                </div>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <ProductDetail label="Código / SKU" value={selectedProduct.code || "Sin código"} mono />
                <ProductDetail label="Código de categoría" value={selectedProduct.categoryCode || "Sin código"} mono />
                <ProductDetail label="Categoría" value={selectedProduct.category || "Sin categoría"} />
                <ProductDetail label="Proveedor" value={selectedProduct.supplier || "Sin proveedor"} />
                <ProductDetail label="Costo" value={formatCurrency(selectedProduct.cost)} />
              </dl>
            </div>
          ) : null}

          {!selectedProduct ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] p-4 text-sm text-[color:var(--muted)]">
              Busca y selecciona un producto para comenzar.
            </div>
          ) : null}
        </CardContent>
      </Card>
      {selectedProduct && canEdit ? (
        <StockAdjustmentDialog
          action={action}
          idempotencyKey={idempotencyKey}
          onClose={closeDialog}
          open={dialogOpen}
          product={selectedProduct}
        />
      ) : null}
    </>
  );
}

function ProductDetail({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[color:var(--panel)] p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{label}</dt>
      <dd className={`mt-1 break-words text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
