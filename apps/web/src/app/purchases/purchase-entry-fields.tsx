"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Field, Input, SearchableSelect } from "@/components/ui";
import { formatNumber } from "@/lib/format";

type PurchaseFormSupplier = {
  id: string;
  name: string;
};

type PurchaseFormProduct = {
  id: string;
  code: string;
  name: string;
  supplierId: string | null;
};

type PurchaseLineDraft = {
  productId: string;
  quantity: string;
};

type PurchaseLineState = PurchaseLineDraft & {
  id: string;
};

type PurchaseInitialLine = {
  productId: string;
  quantity: number;
};

type PurchaseEntryFieldsProps = {
  products: PurchaseFormProduct[];
  suppliers: PurchaseFormSupplier[];
  defaultDate: string;
  initialSupplierId?: string;
  initialLines?: PurchaseInitialLine[];
};

const emptyLine = (): PurchaseLineDraft => ({ productId: "", quantity: "1" });

function numericInput(value: string, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function PurchaseEntryFields({
  defaultDate,
  products,
  suppliers,
  initialSupplierId = "",
  initialLines = [],
}: PurchaseEntryFieldsProps) {
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [draftLine, setDraftLine] = useState<PurchaseLineDraft>(emptyLine());
  const [lines, setLines] = useState<PurchaseLineState[]>(() =>
    initialLines.map((line, index) => ({
      id: `purchase-line-init-${index}`,
      productId: line.productId,
      quantity: String(Math.max(0, Math.trunc(line.quantity))),
    })),
  );
  const lineIdRef = useRef(initialLines.length);

  const filteredProducts = useMemo(
    () => (supplierId ? products.filter((product) => product.supplierId === supplierId) : []),
    [products, supplierId],
  );
  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
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
  const draftProduct = productMap.get(draftLine.productId) ?? null;
  const draftQuantity = Math.max(0, Math.trunc(numericInput(draftLine.quantity, 0)));
  const canAddLine = Boolean(draftProduct && draftQuantity > 0);
  const payload = lines
    .map((line) => ({
      productId: line.productId,
      quantity: Math.max(0, Math.trunc(numericInput(line.quantity, 0))),
    }))
    .filter((line) => productMap.has(line.productId) && line.quantity > 0);

  function updateDraftLine(next: Partial<PurchaseLineDraft>) {
    setDraftLine((current) => ({ ...current, ...next }));
  }

  function updateSupplier(nextSupplierId: string) {
    setSupplierId(nextSupplierId);
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

      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px]">
        <Field htmlFor="purchase-supplier" label="Proveedor">
          <SearchableSelect
            id="purchase-supplier"
            name="supplierId"
            options={supplierOptions}
            placeholder="Seleccionar proveedor"
            required
            value={supplierId}
            onChange={updateSupplier}
          />
        </Field>
        <Field htmlFor="purchase-date" label="Fecha">
          <Input defaultValue={defaultDate} id="purchase-date" name="date" type="date" />
        </Field>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_minmax(0,160px)_auto] xl:items-end">
        <Field className="min-w-0" htmlFor="purchase-product-draft" label="Producto">
          <SearchableSelect
            className="w-full"
            disabled={!supplierId}
            id="purchase-product-draft"
            options={productOptions}
            placeholder={supplierId ? "Seleccionar producto" : "Primero selecciona proveedor"}
            value={draftLine.productId}
            onChange={(productId) => updateDraftLine({ productId })}
          />
        </Field>
        <Field className="min-w-0" htmlFor="purchase-quantity-draft" label="Cantidad">
          <Input
            className="w-full"
            id="purchase-quantity-draft"
            min="1"
            step="1"
            type="number"
            value={draftLine.quantity}
            onChange={(event) => updateDraftLine({ quantity: event.target.value })}
          />
        </Field>
        <Button className="w-full xl:w-auto" disabled={!canAddLine} type="button" onClick={addDraftLine}>
          Agregar producto
        </Button>
      </div>

      {lines.length ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)]">
          <div className="grid grid-cols-[minmax(0,1fr)_96px_92px] gap-2 bg-[color:var(--panel-subtle)] px-3 py-2 text-xs font-bold uppercase text-[color:var(--muted)]">
            <span>Producto</span>
            <span className="text-right">Cantidad</span>
            <span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-[color:var(--border)]">
            {lines.map((line, index) => {
              const product = productMap.get(line.productId);
              return (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_96px_92px] items-center gap-2 px-3 py-2"
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
    </div>
  );
}
