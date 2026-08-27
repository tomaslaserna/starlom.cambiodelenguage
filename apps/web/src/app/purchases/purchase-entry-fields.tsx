"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
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
  newProductName?: string;
  newProductCode?: string;
};

type PurchaseEntryFieldsProps = {
  defaultDate: string;
  initialSupplierId?: string;
  initialLines?: Array<{ productId: string; quantity: number }>;
};

const emptyLine = (): PurchaseLineDraft => ({ productId: "", quantity: "1", unitCost: "" });

function PurchaseProcessingOverlay() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStage((current) => Math.min(current + 1, 3)), 700);
    return () => window.clearInterval(timer);
  }, []);

  const stages = ["Registrando la compra y el IVA", "Ingresando unidades al stock", "Actualizando costos y productos", "Generando la cuenta por pagar"];
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]" role="status" aria-live="polite">
          <div className="w-full max-w-md rounded-2xl border border-blue-100 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-[color:var(--accent)]" />
              <div><div className="font-black">Procesando nueva compra</div><div className="text-sm text-[color:var(--muted)]">No cierres esta pantalla.</div></div>
            </div>
            <div className="mt-5 grid gap-2">
              {stages.map((label, index) => (
                <div className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${index === stage ? "bg-blue-50 text-blue-800" : index < stage ? "text-emerald-700" : "text-slate-400"}`} key={label}>
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-xs ${index < stage ? "bg-emerald-100" : index === stage ? "bg-blue-100" : "bg-slate-100"}`}>{index < stage ? "✓" : index + 1}</span>
                  {label}
                </div>
              ))}
            </div>
          </div>
    </div>
  );
}

function PurchaseSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <><Button className="w-full" disabled={disabled || pending} type="submit">{pending ? "Registrando..." : "Registrar compra e ingreso"}</Button>{pending ? <PurchaseProcessingOverlay /> : null}</>;
}

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
  const [searchAllProducts, setSearchAllProducts] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCode, setNewProductCode] = useState("");
  const [newProductQuantity, setNewProductQuantity] = useState("1");
  const [newProductCost, setNewProductCost] = useState("");
  const [loadingSupplierId, setLoadingSupplierId] = useState(initialSupplierId);
  const [draftLine, setDraftLine] = useState<PurchaseLineDraft>(emptyLine());
  const [lines, setLines] = useState<PurchaseLineState[]>(() => initialLines.map((line, index) => ({
    id: `purchase-line-init-${index}`,
    productId: line.productId,
    quantity: String(Math.max(0, Math.trunc(line.quantity))),
    unitCost: "0",
  })));
  const lineIdRef = useRef(initialLines.length);

  const filteredProducts = useMemo(() => supplierId ? products : [], [products, supplierId]);
  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: `${supplier.paymentTermDays} días de plazo` })),
    [suppliers],
  );
  const productOptions = useMemo(
    () =>
      filteredProducts.map((product) => ({
        value: product.id,
        label: product.name,
        description: `${product.code || "Sin código"} · Costo actual ${formatCurrency(product.cost)}`,
        searchText: `${product.code} ${product.name}`,
      })),
    [filteredProducts],
  );
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const productsLoading = Boolean(supplierId) && loadingSupplierId === supplierId;
  const draftProduct = productMap.get(draftLine.productId) ?? null;
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
  const draftQuantity = Math.max(0, Math.trunc(numericInput(draftLine.quantity, 0)));
  const canAddLine = Boolean(draftProduct && draftQuantity > 0);
  const payload = lines
    .map((line) => ({
      productId: line.productId,
      newProductName: line.newProductName ?? "",
      newProductCode: line.newProductCode ?? "",
      quantity: Math.max(0, Math.trunc(numericInput(line.quantity, 0))),
      unitCost: Math.max(0, numericInput(line.unitCost, 0)),
    }))
    .filter((line) => (productMap.has(line.productId) || Boolean(line.newProductName)) && line.quantity > 0);

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
    const productUrl = searchAllProducts
      ? "/api/purchases/form-products?catalog=all"
      : `/api/purchases/form-products?supplierId=${encodeURIComponent(supplierId)}`;
    void fetch(productUrl, {
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
  }, [supplierId, searchAllProducts]);

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
    setSearchAllProducts(false);
    setDraftLine(emptyLine());
    setLines([]);
  }

  function addNewProductLine() {
    const quantity = Math.max(0, Math.trunc(numericInput(newProductQuantity, 0)));
    const cost = Math.max(0, numericInput(newProductCost, 0));
    if (newProductName.trim().length < 2 || quantity < 1) return;
    setLines((current) => [...current, {
      id: `purchase-line-new-${lineIdRef.current++}`,
      productId: `new:${lineIdRef.current}`,
      newProductName: newProductName.trim(),
      newProductCode: newProductCode.trim(),
      quantity: String(quantity),
      unitCost: String(cost),
    }]);
    setNewProductName("");
    setNewProductCode("");
    setNewProductQuantity("1");
    setNewProductCost("");
    setNewProductOpen(false);
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
    <div className="grid gap-5 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-4">
      <input name="productsJson" type="hidden" value={JSON.stringify(payload)} />
      <input name="total" type="hidden" value={purchaseTotal.toFixed(2)} />

      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] pb-3">
        {[
          ["1", "Proveedor"],
          ["2", "Mercadería"],
          ["3", "IVA y confirmación"],
        ].map(([step, label]) => (
          <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--panel-subtle)] px-3 py-1.5 erp-text-caption font-bold text-[color:var(--foreground)]" key={step}>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--accent)] text-white">{step}</span>
            {label}
          </span>
        ))}
      </div>

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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="erp-text-title-sm font-black">Mercadería recibida</h3>
          <p className="erp-text-caption mt-1 text-[color:var(--muted)]">Buscá dentro del catálogo completo del proveedor o agregá un artículo nuevo.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setNewProductOpen((current) => !current)}>+ Agregar producto nuevo</Button>
      </div>

      {newProductOpen ? (
        <div className="grid gap-3 rounded-[10px] border border-blue-200 bg-blue-50/60 p-4 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
          <Field className="xl:col-span-5" htmlFor="purchase-new-product-name" label="Nombre del nuevo producto"><Input id="purchase-new-product-name" placeholder="Ej.: Detergente concentrado 5 L" value={newProductName} onChange={(event) => setNewProductName(event.target.value)} /></Field>
          <Field className="xl:col-span-2" htmlFor="purchase-new-product-code" label="Código (opcional)"><Input id="purchase-new-product-code" value={newProductCode} onChange={(event) => setNewProductCode(event.target.value)} /></Field>
          <Field className="xl:col-span-2" htmlFor="purchase-new-product-quantity" label="Cantidad"><Input id="purchase-new-product-quantity" min="1" step="1" type="number" value={newProductQuantity} onChange={(event) => setNewProductQuantity(event.target.value)} /></Field>
          <Field className="xl:col-span-2" htmlFor="purchase-new-product-cost" label="Costo unitario s/IVA"><Input id="purchase-new-product-cost" min="0" step="0.01" type="number" value={newProductCost} onChange={(event) => setNewProductCost(event.target.value)} /></Field>
          <Button className="w-full xl:col-span-1" disabled={newProductName.trim().length < 2 || numericInput(newProductQuantity) < 1} type="button" onClick={addNewProductLine}>Agregar</Button>
          <p className="md:col-span-2 xl:col-span-12 text-xs font-semibold text-blue-800">Se creará vinculado a {selectedSupplier?.name ?? "este proveedor"}, con este costo y con la cantidad ingresada como stock inicial.</p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
        <Field className="min-w-0 md:col-span-2 xl:col-span-6" htmlFor="purchase-product-draft" label="Producto">
          <SearchableSelect
            className="w-full min-w-0"
            disabled={!supplierId || productsLoading}
            id="purchase-product-draft"
            emptyMessage={searchAllProducts ? "No se encontró en el catálogo general" : "No se encontró entre los productos de este proveedor"}
            maxResults={60}
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
      {supplierId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[color:var(--muted)]">
          <span>El costo se completa con el valor actual y queda disponible para corregirlo.</span>
          <button className="text-[color:var(--accent-strong)] underline underline-offset-2" type="button" onClick={() => { setLoadingSupplierId(supplierId); setSearchAllProducts((current) => !current); setDraftLine(emptyLine()); }}>
            {searchAllProducts ? `Ver solo productos de ${selectedSupplier?.name ?? "este proveedor"}` : "Buscar un producto existente en todo el catálogo"}
          </button>
        </div>
      ) : null}
      {selectedSupplier ? <p className="erp-text-body-sm font-semibold text-[color:var(--muted)]">Vencimiento automático: {selectedSupplier.paymentTermDays === 0 ? "pago al recibir" : `${selectedSupplier.paymentTermDays} días desde la fecha de compra`}.</p> : null}

      {draftProduct ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {draftProduct.imageUrl ? <img alt={draftProduct.name} className="h-20 w-20 rounded-[9px] bg-white object-contain" src={draftProduct.imageUrl} /> : <div className="grid h-20 w-20 place-items-center rounded-[9px] border border-dashed border-[color:var(--border)] bg-white text-center text-xs text-[color:var(--muted)]">Sin imagen</div>}
          <div><div className="font-bold">{draftProduct.name}</div><div className="erp-text-caption mt-1 text-[color:var(--muted)]">Costo registrado: <strong className="text-[color:var(--foreground)]">{formatCurrency(draftProduct.cost)}</strong></div></div>
          <ButtonLink className="ml-auto" href={`/prices/${draftProduct.id}/edit`} size="sm" target="_blank" variant="secondary">Imagen y ficha</ButtonLink>
        </div>
      ) : null}

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
              const lineName = product?.name ?? line.newProductName ?? line.productId;
              return (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_96px_130px_120px_92px] items-center gap-2 px-3 py-2"
                  key={line.id}
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold" title={lineName}>
                      {lineName}
                    </div>
                    {product?.code ? (
                      <div className="text-xs text-[color:var(--muted)]">{product.code}</div>
                    ) : line.newProductCode ? <div className="text-xs text-[color:var(--muted)]">{line.newProductCode} · Nuevo producto</div> : line.newProductName ? <div className="text-xs font-semibold text-blue-700">Nuevo producto</div> : null}
                  </div>
                  <Input
                    aria-label={`Cantidad de ${lineName}`}
                    className="min-h-9 px-2 text-right text-xs"
                    min="1"
                    step="1"
                    type="number"
                    value={line.quantity}
                    onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  />
                  <Input aria-label={`Costo de ${lineName}`} className="min-h-9 px-2 text-right text-xs" min="0" step="0.01" type="number" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} />
                  <span className="text-right font-mono text-xs font-bold">{formatCurrency(numericInput(line.quantity) * numericInput(line.unitCost))}</span>
                  <Button
                    aria-label={`Quitar ${lineName}`}
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

      <div className="grid gap-3 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4 md:grid-cols-[1fr_180px_160px] md:items-end">
        <div className="erp-text-body-sm text-[color:var(--muted)]">El costo se toma del remito. Si cambió, actualizará automáticamente la ficha del producto.</div>
        <Field htmlFor="purchase-tax-mode" label="IVA"><Select id="purchase-tax-mode" name="taxMode" value={taxMode} onChange={(event) => setTaxMode(event.target.value)}><option value="con_iva">Con IVA</option><option value="sin_iva">Sin IVA</option></Select></Field>
        <Field htmlFor="purchase-vat-rate" label="Alícuota"><Select disabled={taxMode === "sin_iva"} id="purchase-vat-rate" name="vatRate" value={vatRate} onChange={(event) => setVatRate(event.target.value)}><option value="21">21%</option><option value="10.5">10,5%</option><option value="0">0%</option></Select></Field>
        <div className="md:col-span-3 grid overflow-hidden rounded-[9px] border border-[color:var(--border)] bg-white text-right sm:grid-cols-3">
          <span className="px-4 py-3">Neto <strong className="ml-2 tabular-nums">{formatCurrency(netTotal)}</strong></span>
          <span className="border-y border-[color:var(--border)] px-4 py-3 sm:border-x sm:border-y-0">IVA <strong className="ml-2 tabular-nums">{formatCurrency(vatAmount)}</strong></span>
          <span className="bg-[color:var(--accent-subtle)] px-4 py-3 font-bold text-[color:var(--accent-strong)]">Total <strong className="ml-2 tabular-nums">{formatCurrency(purchaseTotal)}</strong></span>
        </div>
      </div>

      <div className="grid gap-3 border-t border-[color:var(--border)] pt-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-end">
        <Field className="min-w-0" htmlFor="purchase-description" label="Comprobante del proveedor / observaciones">
          <Input className="w-full min-w-0" id="purchase-description" name="description" placeholder="Ej.: Remito 4581 · entrega completa" />
        </Field>
        <PurchaseSubmit disabled={payload.length === 0} />
      </div>
    </div>
  );
}
