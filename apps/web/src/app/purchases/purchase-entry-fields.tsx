"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonLink, Field, Input, SearchableSelect, Select } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";

type PurchaseFormSupplier = {
  id: string;
  name: string;
  paymentTermDays: number;
};

type PurchaseFormProduct = {
  id: string;
  code: string;
  name: string;
  supplierId: string | null;
  cost: number;
  imageUrl: string;
};

type PurchaseLineDraft = {
  productId: string;
  quantity: string;
  unitCost: string;
};

type PurchaseLineState = PurchaseLineDraft & {
  id: string;
};

type PurchaseEntryFieldsProps = {
  defaultDate: string;
  initialSupplierId?: string;
  initialLines?: Array<{ productId: string; quantity: number }>;
};

const emptyLine = (): PurchaseLineDraft => ({ productId: "", quantity: "1", unitCost: "" });

function numericInput(value: string, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function PurchaseEntryFields({ defaultDate, initialSupplierId = "", initialLines = [] }: PurchaseEntryFieldsProps) {
  const [taxMode, setTaxMode] = useState("con_iva");
  const [vatRate, setVatRate] = useState("21");
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [suppliers, setSuppliers] = useState<PurchaseFormSupplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [suppliersLoadFailed, setSuppliersLoadFailed] = useState(false);
  const [products, setProducts] = useState<PurchaseFormProduct[]>([]);
  const [loadingSupplierId, setLoadingSupplierId] = useState(initialSupplierId);
  const [draftLine, setDraftLine] = useState<PurchaseLineDraft>(emptyLine());
  const [lines, setLines] = useState<PurchaseLineState[]>(() => initialLines.map((line, index) => ({
    id: `purchase-line-init-${index}`,
    productId: line.productId,
    quantity: String(Math.max(0, Math.trunc(line.quantity))),
    unitCost: "0",
  })));
  const lineIdRef = useRef(initialLines.length);

  const filteredProducts = useMemo(
    () => (supplierId ? products.filter((product) => product.supplierId === supplierId) : []),
    [products, supplierId],
  );
  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: `${supplier.paymentTermDays} días de plazo` })),
    [suppliers],
  );
  const productOptions = useMemo(
    () =>
      filteredProducts.map((product) => ({
        value: product.id,
        label: product.name,
        description: product.code || "Sin codigo",
        searchText: product.code,
      })),
    [filteredProducts],
  );
  const productMap = useMemo(() => new Map(filteredProducts.map((product) => [product.id, product])), [filteredProducts]);
  const productsLoading = Boolean(supplierId) && loadingSupplierId === supplierId;
  const draftProduct = productMap.get(draftLine.productId) ?? null;
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
  const draftQuantity = Math.max(0, Math.trunc(numericInput(draftLine.quantity, 0)));
  const canAddLine = Boolean(draftProduct && draftQuantity > 0);
  const payload = lines
    .map((line) => ({
      productId: line.productId,
      quantity: Math.max(0, Math.trunc(numericInput(line.quantity, 0))),
      unitCost: Math.max(0, numericInput(line.unitCost, 0)),
    }))
    .filter((line) => productMap.has(line.productId) && line.quantity > 0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/purchases/form-suppliers", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: PurchaseFormSupplier[] };
        if (!response.ok || !Array.isArray(payload.data)) throw new Error("No se pudieron cargar los proveedores");
        setSuppliers(payload.data);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuppliersLoadFailed(true);
      })
      .finally(() => setSuppliersLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!supplierId) return;
    const controller = new AbortController();
    void fetch(`/api/purchases/form-products?supplierId=${encodeURIComponent(supplierId)}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: PurchaseFormProduct[] };
        if (!response.ok || !Array.isArray(payload.data)) throw new Error("No se pudieron cargar los productos");
        setProducts(payload.data);
        const costs = new Map(payload.data.map((product) => [product.id, product.cost]));
        setLines((current) => current.map((line) =>
          numericInput(line.unitCost, 0) > 0 || !costs.has(line.productId)
            ? line
            : { ...line, unitCost: String(costs.get(line.productId) ?? 0) },
        ));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setProducts([]);
      })
      .finally(() => setLoadingSupplierId((current) => (current === supplierId ? "" : current)));
    return () => controller.abort();
  }, [supplierId]);

  function updateDraftLine(next: Partial<PurchaseLineDraft>) {
    setDraftLine((current) => ({ ...current, ...next }));
  }

  const netTotal = payload.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const vatAmount = taxMode === "con_iva" ? netTotal * numericInput(vatRate) / 100 : 0;
  const purchaseTotal = netTotal + vatAmount;

  function updateSupplier(nextSupplierId: string) {
    setSupplierId(nextSupplierId);
    setLoadingSupplierId(nextSupplierId);
    setProducts([]);
    setDraftLine(emptyLine());
    setLines([]);
  }

  function addDraftLine() {
    if (!canAddLine) return;
    setLines((current) => {
      const existingIndex = current.findIndex((line) => line.productId === draftLine.productId);
      if (existingIndex >= 0) {
        return current.map((line, index) =>
          index === existingIndex
            ? {
                ...line,
                quantity: String(Math.max(0, Math.trunc(numericInput(line.quantity, 0))) + draftQuantity),
              }
            : line,
        );
      }
      return [
        ...current,
        {
          id: `purchase-line-${lineIdRef.current++}`,
          productId: draftLine.productId,
          quantity: String(draftQuantity),
          unitCost: draftLine.unitCost,
        },
      ];
    });
    setDraftLine(emptyLine());
  }

  function updateLine(index: number, next: Partial<PurchaseLineDraft>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...next } : line)));
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <div className="grid gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-3">
      <input name="productsJson" type="hidden" value={JSON.stringify(payload)} />
      <input name="total" type="hidden" value={purchaseTotal.toFixed(2)} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        <Field className="min-w-0 xl:col-span-10" htmlFor="purchase-supplier" label="Proveedor">
          <SearchableSelect
            className="w-full min-w-0"
            disabled={suppliersLoading || suppliersLoadFailed}
            id="purchase-supplier"
            name="supplierId"
            options={supplierOptions}
            placeholder={suppliersLoading ? "Cargando proveedores..." : suppliersLoadFailed ? "No se pudieron cargar proveedores" : "Seleccionar proveedor"}
            required
            value={supplierId}
            onChange={updateSupplier}
          />
        </Field>
        <Field className="min-w-0 xl:col-span-2" htmlFor="purchase-date" label="Fecha">
          <Input className="w-full min-w-0" defaultValue={defaultDate} id="purchase-date" name="date" type="date" />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
        <Field className="min-w-0 md:col-span-2 xl:col-span-6" htmlFor="purchase-product-draft" label="Producto">
          <SearchableSelect
            className="w-full min-w-0"
            disabled={!supplierId || productsLoading}
            id="purchase-product-draft"
            options={productOptions}
            placeholder={supplierId ? (productsLoading ? "Cargando productos..." : "Seleccionar producto") : "Primero selecciona proveedor"}
            value={draftLine.productId}
            onChange={(productId) => updateDraftLine({ productId, unitCost: String(productMap.get(productId)?.cost ?? "") })}
          />
        </Field>
        <Field className="min-w-0 xl:col-span-2" htmlFor="purchase-quantity-draft" label="Cantidad">
          <Input
            className="w-full min-w-0"
            id="purchase-quantity-draft"
            min="1"
            step="1"
            type="number"
            value={draftLine.quantity}
            onChange={(event) => updateDraftLine({ quantity: event.target.value })}
          />
        </Field>
        <Field className="min-w-0 xl:col-span-2" htmlFor="purchase-cost-draft" label="Costo unitario s/IVA">
          <Input id="purchase-cost-draft" min="0" step="0.01" type="number" value={draftLine.unitCost} onChange={(event) => updateDraftLine({ unitCost: event.target.value })} />
        </Field>
        <Button className="w-full xl:col-span-2" disabled={!canAddLine} type="button" onClick={addDraftLine}>
          Agregar producto
        </Button>
      </div>
      {selectedSupplier ? <p className="erp-text-body-sm font-semibold text-[color:var(--muted)]">Vencimiento automático: {selectedSupplier.paymentTermDays === 0 ? "pago al recibir" : `${selectedSupplier.paymentTermDays} días desde la fecha de compra`}.</p> : null}

      {draftProduct ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-[color:var(--panel-subtle)] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {draftProduct.imageUrl ? <img alt={draftProduct.name} className="h-20 w-20 rounded-[9px] bg-white object-contain" src={draftProduct.imageUrl} /> : <div className="grid h-20 w-20 place-items-center rounded-[9px] border border-dashed border-[color:var(--border)] bg-white text-center text-xs text-[color:var(--muted)]">Sin imagen</div>}
          <div><div className="font-bold">{draftProduct.name}</div><div className="erp-text-caption text-[color:var(--muted)]">Costo actual: {formatCurrency(draftProduct.cost)}</div></div>
          <ButtonLink className="ml-auto" href={`/prices/${draftProduct.id}/edit`} size="sm" target="_blank" variant="secondary">Revisar imagen</ButtonLink>
        </div>
      ) : null}

      <div className="flex justify-end"><ButtonLink href="/prices/new" target="_blank" variant="outline">+ Agregar producto nuevo</ButtonLink></div>

      {lines.length ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)]">
          <div className="grid grid-cols-[minmax(0,1fr)_96px_130px_120px_92px] gap-2 bg-[color:var(--panel-subtle)] px-3 py-2 text-xs font-bold uppercase text-[color:var(--muted)]">
            <span>Producto</span>
            <span className="text-right">Cantidad</span>
            <span className="text-right">Costo unit.</span>
            <span className="text-right">Subtotal</span>
            <span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-[color:var(--border)]">
            {lines.map((line, index) => {
              const product = productMap.get(line.productId);
              return (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_96px_130px_120px_92px] items-center gap-2 px-3 py-2"
                  key={line.id}
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold" title={product?.name ?? line.productId}>
                      {product?.name ?? line.productId}
                    </div>
                    {product?.code ? (
                      <div className="text-xs text-[color:var(--muted)]">{product.code}</div>
                    ) : null}
                  </div>
                  <Input
                    aria-label={`Cantidad de ${product?.name ?? "producto"}`}
                    className="min-h-9 px-2 text-right text-xs"
                    min="1"
                    step="1"
                    type="number"
                    value={line.quantity}
                    onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  />
                  <Input aria-label={`Costo de ${product?.name ?? "producto"}`} className="min-h-9 px-2 text-right text-xs" min="0" step="0.01" type="number" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} />
                  <span className="text-right font-mono text-xs font-bold">{formatCurrency(numericInput(line.quantity) * numericInput(line.unitCost))}</span>
                  <Button
                    aria-label={`Quitar ${product?.name ?? "producto"}`}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => removeLine(index)}
                  >
                    Quitar
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="border-t border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--muted)]">
            {payload.length} productos agregados - {formatNumber(payload.reduce((sum, line) => sum + line.quantity, 0))} unidades
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] px-3 py-2 text-sm font-semibold text-[color:var(--muted)]">
          {supplierId && filteredProducts.length === 0
            ? "Este proveedor no tiene productos asociados."
            : "Todavia no agregaste productos a esta compra."}
        </div>
      )}

      <div className="grid gap-3 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-3 md:grid-cols-[1fr_180px_160px] md:items-end">
        <div className="erp-text-body-sm text-[color:var(--muted)]">El costo se toma del remito. Si cambió, actualizará automáticamente la ficha del producto.</div>
        <Field htmlFor="purchase-tax-mode" label="IVA"><Select id="purchase-tax-mode" name="taxMode" value={taxMode} onChange={(event) => setTaxMode(event.target.value)}><option value="con_iva">Con IVA</option><option value="sin_iva">Sin IVA</option></Select></Field>
        <Field htmlFor="purchase-vat-rate" label="Alícuota"><Select disabled={taxMode === "sin_iva"} id="purchase-vat-rate" name="vatRate" value={vatRate} onChange={(event) => setVatRate(event.target.value)}><option value="21">21%</option><option value="10.5">10,5%</option><option value="0">0%</option></Select></Field>
        <div className="md:col-span-3 grid gap-2 text-right sm:grid-cols-3"><span>Neto <strong>{formatCurrency(netTotal)}</strong></span><span>IVA <strong>{formatCurrency(vatAmount)}</strong></span><span>Total <strong>{formatCurrency(purchaseTotal)}</strong></span></div>
      </div>
    </div>
  );
}
