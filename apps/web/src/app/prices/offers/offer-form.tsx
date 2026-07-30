"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input, SearchableSelect, Select } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import type { OrderFormProduct } from "@/lib/orders";
import type { PriceOffer } from "@/lib/price-offers";

type ComboItem = { productId: string; name: string; code: string; quantity: number };

export function OfferForm({
  action,
  products,
  offer,
}: {
  action: (formData: FormData) => Promise<void>;
  products: OrderFormProduct[];
  offer?: PriceOffer;
}) {
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const [items, setItems] = useState<ComboItem[]>(
    () =>
      offer?.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        code: item.code,
        quantity: item.quantity,
      })) ?? [],
  );
  const [draftProduct, setDraftProduct] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [priceMode, setPriceMode] = useState<"fijo" | "descuento">(offer?.priceMode ?? "fijo");

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        description: `${product.code || "Sin código"} · Disp. ${formatNumber(product.available)}`,
        searchText: product.code,
      })),
    [products],
  );

  function addItem() {
    const product = productById.get(draftProduct);
    const qty = Math.max(1, Math.trunc(Number(draftQty) || 0));
    if (!product || qty <= 0) return;
    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + qty } : item));
      }
      return [...current, { productId: product.id, name: product.name, code: product.code, quantity: qty }];
    });
    setDraftProduct("");
    setDraftQty("1");
  }

  function removeItem(productId: string) {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }

  const idSuffix = offer?.id ?? "new";

  return (
    <form action={action} className="grid gap-4">
      {offer ? <input name="id" type="hidden" value={offer.id} /> : null}
      <input name="itemsJson" type="hidden" value={JSON.stringify(items.map((i) => ({ productId: i.productId, quantity: i.quantity })))} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field htmlFor={`offer-name-${idSuffix}`} label="Nombre de la oferta" required>
          <Input defaultValue={offer?.name ?? ""} id={`offer-name-${idSuffix}`} maxLength={120} name="name" required />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input defaultChecked={offer?.active ?? true} name="active" type="checkbox" />
          <span>Oferta activa</span>
        </label>
      </div>

      {/* Armador de combo */}
      <div className="grid gap-3 rounded-[10px] border border-[#d9e2ef] p-3">
        <span className="erp-text-caption font-bold text-[#0f172a]">Artículos del combo</span>
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_110px_auto] sm:items-end">
          <Field htmlFor={`offer-product-${idSuffix}`} label="Producto">
            <SearchableSelect
              id={`offer-product-${idSuffix}`}
              options={productOptions}
              placeholder="Buscar producto"
              value={draftProduct}
              onChange={(value) => setDraftProduct(value)}
            />
          </Field>
          <Field htmlFor={`offer-qty-${idSuffix}`} label="Cantidad">
            <Input
              id={`offer-qty-${idSuffix}`}
              inputMode="numeric"
              min="1"
              onChange={(event) => setDraftQty(event.target.value)}
              step="1"
              type="number"
              value={draftQty}
            />
          </Field>
          <Button disabled={!draftProduct} onClick={addItem} type="button">
            Agregar
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="erp-text-caption text-[#94a3b8]">Todavía no agregaste artículos.</p>
        ) : (
          <ul className="divide-y divide-[#eef2f8] rounded-md border border-[#eef2f8]">
            {items.map((item) => (
              <li className="flex items-center justify-between gap-2 px-3 py-2" key={item.productId}>
                <span className="min-w-0 truncate text-sm">
                  <span className="font-semibold">{formatNumber(item.quantity)}×</span> {item.name}
                  <span className="ml-1 font-mono text-xs text-[#94a3b8]">{item.code}</span>
                </span>
                <button className="text-xs text-[#dc2626] hover:underline" onClick={() => removeItem(item.productId)} type="button">
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Precio */}
      <div className="grid gap-4 md:grid-cols-3">
        <Field htmlFor={`offer-mode-${idSuffix}`} label="Precio">
          <Select
            id={`offer-mode-${idSuffix}`}
            name="priceMode"
            onChange={(event) => setPriceMode(event.target.value === "descuento" ? "descuento" : "fijo")}
            value={priceMode}
          >
            <option value="fijo">Precio fijo (todas las listas)</option>
            <option value="descuento">Descuento % sobre la lista</option>
          </Select>
        </Field>
        {priceMode === "fijo" ? (
          <Field htmlFor={`offer-fixed-${idSuffix}`} label="Precio fijo" required>
            <Input defaultValue={offer?.fixedPrice != null ? String(offer.fixedPrice) : ""} id={`offer-fixed-${idSuffix}`} inputMode="decimal" name="fixedPrice" step="0.01" type="number" />
          </Field>
        ) : (
          <>
            <Field htmlFor={`offer-disc-${idSuffix}`} label="Descuento (%)" required>
              <Input defaultValue={offer?.discountPercent != null ? String(offer.discountPercent) : ""} id={`offer-disc-${idSuffix}`} inputMode="decimal" max="100" min="0" name="discountPercent" step="0.01" type="number" />
            </Field>
            <Field htmlFor={`offer-min-${idSuffix}`} label="Precio mínimo (opcional)">
              <Input defaultValue={offer?.minPrice != null ? String(offer.minPrice) : ""} id={`offer-min-${idSuffix}`} inputMode="decimal" name="minPrice" step="0.01" type="number" />
            </Field>
          </>
        )}
      </div>

      {/* Vigencia y stock */}
      <div className="grid gap-4 md:grid-cols-3">
        <Field htmlFor={`offer-from-${idSuffix}`} label="Vigencia desde (opcional)" description="En blanco = ya vigente. Futuro = programada.">
          <Input defaultValue={offer?.validFrom ?? ""} id={`offer-from-${idSuffix}`} name="validFrom" type="date" />
        </Field>
        <Field htmlFor={`offer-to-${idSuffix}`} label="Vigencia hasta (opcional)" description="En blanco = indefinida.">
          <Input defaultValue={offer?.validTo ?? ""} id={`offer-to-${idSuffix}`} name="validTo" type="date" />
        </Field>
        <Field htmlFor={`offer-stock-${idSuffix}`} label="Límite de stock (opcional)" description="En blanco = ilimitado.">
          <Input defaultValue={offer?.stockLimit != null ? String(offer.stockLimit) : ""} id={`offer-stock-${idSuffix}`} inputMode="numeric" min="0" name="stockLimit" step="1" type="number" />
        </Field>
      </div>

      <div>
        <Button disabled={items.length === 0} type="submit">
          {offer ? "Guardar cambios" : "Crear oferta"}
        </Button>
      </div>
    </form>
  );
}
