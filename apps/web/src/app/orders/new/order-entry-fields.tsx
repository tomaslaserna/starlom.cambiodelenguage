"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Button,
  Card,
  CardContent,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Field,
  Input,
  SearchableSelect,
  Select,
} from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import { DEFAULT_PRICE_LIST_NAME, priceForList, resolvePriceListName, samePriceListName } from "@/lib/order-pricing";
import { presentationPriceForLine, presentationSuggestion } from "@/lib/presentation-pricing";
import { offerLineDiscount } from "@/lib/offer-status";
import type { PriceOffer } from "@/lib/price-offers";
import { localDateIso } from "@/lib/timezone";
import { desiredDocumentLabel, invoiceSaleOrderDocument, saleOrderDocument, saleVatRateForDocument } from "@/lib/receipt-types";
import type { OrderFormClient, OrderFormPriceList, OrderFormProduct } from "@/lib/orders";
import { OrderConfirmationPreview } from "@/app/orders/new/order-confirmation-preview";
import type { IvaRate } from "@/lib/order-confirmation";
import { vatAmountsFromNet } from "@/lib/vat-calculation";
import { grossMarginPercent, marginRisk } from "@/lib/sale-margin";

type OrderLineDraft = {
  productId: string;
  quantity: string;
  discount: string;
};

type OrderLineState = OrderLineDraft & {
  id: string;
};

type OccasionalLineDraft = {
  description: string;
  quantity: string;
  discount: string;
  unitCost: string;
  unitPrice: string;
};

type OccasionalLineState = OccasionalLineDraft & { id: string };

export type OrderEntryInitialValue = {
  customerId: string;
  date: string;
  observation: string;
  priceListOverride: string;
  vatRate?: number;
  lines: OrderLineDraft[];
  occasionalLines?: OccasionalLineDraft[];
};

type OrderEntryFieldsProps = {
  clients: OrderFormClient[];
  priceLists: OrderFormPriceList[];
  products: OrderFormProduct[];
  initialValue?: OrderEntryInitialValue;
  offers?: { id: string; title: string; description: string }[];
  offersEnabled?: boolean;
  offersRemaining?: number;
  comboOffers?: PriceOffer[];
  offerListNames?: string[];
  submitLabel: string;
};

const emptyLine = (): OrderLineDraft => ({ productId: "", quantity: "1", discount: "0" });
const emptyOccasionalLine = (): OccasionalLineDraft => ({ description: "", quantity: "1", discount: "0", unitCost: "", unitPrice: "" });
const roundMoney = (value: number) => Math.round(value * 100) / 100;

function numericInput(value: string, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function isWholeQuantityInput(value: string) {
  return value === "" || /^\d+$/.test(value);
}

export function OrderEntryFields({
  clients,
  priceLists,
  products,
  initialValue,
  offers = [],
  offersEnabled = true,
  offersRemaining = 0,
  comboOffers = [],
  offerListNames = [],
  submitLabel,
}: OrderEntryFieldsProps) {
  const [customerId, setCustomerId] = useState(initialValue?.customerId ?? "");
  const [draftLine, setDraftLine] = useState<OrderLineDraft>(emptyLine());
  const [lines, setLines] = useState<OrderLineState[]>(() =>
    (initialValue?.lines ?? []).map((line, index) => ({
      ...line,
      id: `order-line-${index}`,
    })),
  );
  const [occasionalLines, setOccasionalLines] = useState<OccasionalLineState[]>(() =>
    (initialValue?.occasionalLines ?? []).map((line, index) => ({ ...line, id: `occasional-line-${index}` })),
  );
  const [occasionalDraft, setOccasionalDraft] = useState<OccasionalLineDraft>(emptyOccasionalLine());
  const [showOccasional, setShowOccasional] = useState(false);
  const [date, setDate] = useState(() => initialValue?.date || localDateIso());
  const [observation, setObservation] = useState(initialValue?.observation ?? "");
  const [priceListOverride, setPriceListOverride] = useState(initialValue?.priceListOverride ?? "");
  const [requestedDocument, setRequestedDocument] = useState<"habitual" | "remito" | "factura">("habitual");
  const [draftError, setDraftError] = useState("");
  const [addedProducts, setAddedProducts] = useState<OrderFormProduct[]>([]);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCost, setNewProductCost] = useState("");
  const [newProductMargin, setNewProductMargin] = useState("");
  const [creatingProduct, setCreatingProduct] = useState(false);
  const lineIdRef = useRef(initialValue?.lines.length ?? 0);
  const occasionalIdRef = useRef(initialValue?.occasionalLines?.length ?? 0);

  const selectedClient = clients.find((client) => client.id === customerId) ?? null;
  const allProducts = useMemo(() => [...products, ...addedProducts], [products, addedProducts]);
  const productMap = useMemo(() => new Map(allProducts.map((product) => [product.id, product])), [allProducts]);
  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.name,
        description: [client.taxId, client.legalName !== client.name ? client.legalName : ""].filter(Boolean).join(" - "),
        searchText: [client.legalName, client.taxId, client.seller, client.phone].filter(Boolean).join(" "),
      })),
    [clients],
  );
  const priceListOptions = priceLists.length ? priceLists : [{ name: DEFAULT_PRICE_LIST_NAME }];
  const habitualDocument = saleOrderDocument(selectedClient?.receiptType);
  const desiredDocument = requestedDocument === "factura"
    ? invoiceSaleOrderDocument(selectedClient?.fiscalCondition, selectedClient?.receiptType)
    : requestedDocument === "remito"
      ? "remito"
      : habitualDocument;
  const vatRate: IvaRate = saleVatRateForDocument(desiredDocument) ?? 0;
  const hasConfiguredDocument = desiredDocument !== null && vatRate > 0;
  const customerPriceList = selectedClient
    ? resolvePriceListName(selectedClient.priceList, priceListOptions)
    : "";
  const activePriceList = resolvePriceListName(priceListOverride || customerPriceList, priceListOptions);
  const productOptions = useMemo(
    () =>
      allProducts.map((product) => ({
        value: product.id,
        label: product.name,
        description: `${product.code || "Sin codigo"} - Presentación: ${product.presentationUnits} u. - Disponible: ${formatNumber(product.available)} - Precio neto: ${formatCurrency(priceForList(product.prices, activePriceList))}`,
        searchText: product.code,
      })),
    [activePriceList, allProducts],
  );

  async function createNewProduct() {
    setDraftError("");
    setCreatingProduct(true);
    try {
      const response = await fetch("/api/orders/new-product", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newProductName, cost: newProductCost, margin: newProductMargin }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo crear el producto");
      const product = result.data as OrderFormProduct;
      setAddedProducts((current) => [...current, product]);
      setDraftLine((current) => ({ ...current, productId: product.id }));
      setNewProductName("");
      setNewProductCost("");
      setNewProductMargin("");
      setShowNewProduct(false);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "No se pudo crear el producto");
    } finally {
      setCreatingProduct(false);
    }
  }

  const calculatedLines = lines
    .map((line) => {
      const product = productMap.get(line.productId);
      if (!product) return null;
      const quantity = Math.max(0, Math.trunc(numericInput(line.quantity, 0)));
      const discount = Math.min(100, Math.max(0, numericInput(line.discount, 0)));
      const pricing = presentationPriceForLine({ prices: product.prices, priceListName: activePriceList, presentationUnits: product.presentationUnits, quantity, discount });
      return {
        ...line,
        product,
        quantity,
        discount,
        unitPrice: pricing.effectiveUnitPrice,
        subtotal: pricing.subtotal,
        presentationPricing: pricing,
        marginPercent: grossMarginPercent(pricing.subtotal, product.cost * quantity),
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  const calculatedOccasionalLines = occasionalLines.map((line) => {
    const quantity = Math.max(0, Math.trunc(numericInput(line.quantity, 0)));
    const discount = Math.min(100, Math.max(0, numericInput(line.discount, 0)));
    const unitCost = roundMoney(numericInput(line.unitCost, 0));
    const unitPrice = roundMoney(numericInput(line.unitPrice, 0));
    const subtotal = roundMoney(quantity * unitPrice * (1 - discount / 100));
    return {
      ...line,
      quantity,
      discount,
      unitCost,
      unitPrice,
      subtotal,
      marginPercent: grossMarginPercent(subtotal, unitCost * quantity),
    };
  });
  const netAmount = calculatedLines.reduce((total, line) => total + line.subtotal, 0)
    + calculatedOccasionalLines.reduce((total, line) => total + line.subtotal, 0);
  const totalCost = calculatedLines.reduce((total, line) => total + line.product.cost * line.quantity, 0)
    + calculatedOccasionalLines.reduce((total, line) => total + line.unitCost * line.quantity, 0);
  const orderMarginPercent = grossMarginPercent(netAmount, totalCost);
  const lowMarginLines = [
    ...calculatedLines.map((line) => ({ ...line, name: line.product.name })),
    ...calculatedOccasionalLines.map((line) => ({ ...line, name: line.description })),
  ].filter((line) => line.quantity > 0 && marginRisk(line.marginPercent) !== "none");
  const orderMarginRisk = marginRisk(orderMarginPercent);
  const orderTotals = vatAmountsFromNet(netAmount, vatRate);
  const pricedLines = calculatedLines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      quantity: line.quantity,
      name: line.product.name,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
    })).concat(calculatedOccasionalLines.filter((line) => line.quantity > 0).map((line) => ({
      quantity: line.quantity,
      name: line.description,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
    })));
  const pricingSuggestions = calculatedLines.flatMap((line) => {
    const suggestion = presentationSuggestion(line.product.name, line.presentationPricing);
    return suggestion ? [suggestion] : [];
  });
  const draftProduct = productMap.get(draftLine.productId) ?? null;
  const draftQuantity = Math.max(0, Math.trunc(numericInput(draftLine.quantity, 0)));
  const draftDiscount = Math.min(100, Math.max(0, numericInput(draftLine.discount, 0)));
  const draftPricing = draftProduct ? presentationPriceForLine({ prices: draftProduct.prices, priceListName: activePriceList, presentationUnits: draftProduct.presentationUnits, quantity: draftQuantity, discount: draftDiscount }) : null;
  const draftUnitPrice = draftPricing?.effectiveUnitPrice ?? 0;
  const draftSubtotal = draftPricing?.subtotal ?? 0;
  const draftHasPrice = draftUnitPrice > 0;
  const missingDraftPrice = Boolean(draftProduct && !draftHasPrice);
  const canAddLine = Boolean(selectedClient && draftProduct && draftQuantity > 0 && draftHasPrice);
  const canSubmit = Boolean(selectedClient)
    && (calculatedLines.some((line) => line.quantity > 0) || calculatedOccasionalLines.some((line) => line.quantity > 0))
    && hasConfiguredDocument
    && (initialValue?.vatRate === undefined || initialValue.vatRate > 0);

  const payload: Array<Record<string, string | number>> = calculatedLines.map((line) => ({
    productId: line.product.id,
    quantity: line.quantity,
    discount: line.discount,
  }));
  payload.push(...calculatedOccasionalLines.map((line) => ({
    type: "occasional",
    description: line.description,
    quantity: line.quantity,
    discount: line.discount,
    unitCost: line.unitCost,
    unitPrice: line.unitPrice,
  })));

  const occasionalCost = numericInput(occasionalDraft.unitCost, 0);
  const occasionalPrice = numericInput(occasionalDraft.unitPrice, 0);
  const occasionalMargin = occasionalPrice > 0
    ? ((occasionalPrice - occasionalCost) / occasionalPrice) * 100
    : 0;

  function addOccasionalLine() {
    const description = occasionalDraft.description.trim();
    const quantity = numericInput(occasionalDraft.quantity, 0);
    if (!selectedClient || !description || description.length > 180 || !Number.isInteger(quantity)
      || quantity <= 0 || occasionalDraft.unitCost === "" || occasionalCost < 0 || occasionalPrice <= 0) {
      setDraftError("Elegí un cliente y completá nombre, cantidad, costo y precio del artículo ocasional.");
      return;
    }
    setOccasionalLines((current) => [...current, {
      ...occasionalDraft,
      id: `occasional-line-${occasionalIdRef.current++}`,
      description,
    }]);
    setOccasionalDraft(emptyOccasionalLine());
    setShowOccasional(false);
    setDraftError("");
  }

  function updateDraftLine(next: Partial<OrderLineDraft>) {
    setDraftError("");
    setDraftLine((current) => ({ ...current, ...next }));
  }

  function addDraftLine() {
    if (!canAddLine) {
      setDraftError(
        !selectedClient
          ? "Selecciona un cliente antes de agregar productos."
          : !draftProduct
            ? "Selecciona un producto."
            : draftQuantity <= 0
              ? "La cantidad debe ser mayor a cero."
              : `El producto no tiene precio para la lista ${activePriceList}.`,
      );
      return;
    }
    setLines((current) => [
      ...current,
      {
        id: `order-line-${lineIdRef.current++}`,
        productId: draftLine.productId,
        quantity: String(draftQuantity),
        discount: String(draftDiscount),
      },
    ]);
    setDraftLine(emptyLine());
    setDraftError("");
  }

  function applyOffer(offer: PriceOffer) {
    const items = offer.items
      .map((item) => {
        const product = allProducts.find((candidate) => candidate.id === item.productId);
        if (!product) return null;
        const price = priceForList(product.prices, activePriceList);
        return price > 0 ? { productId: product.id, quantity: item.quantity, price } : null;
      })
      .filter((item): item is { productId: string; quantity: number; price: number } => item !== null);
    if (items.length === 0) {
      setDraftError(`Los productos de la oferta "${offer.name}" no tienen precio en la lista ${activePriceList}.`);
      return;
    }
    const baseTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = offerLineDiscount(offer, baseTotal);
    setLines((current) => [
      ...current,
      ...items.map((item) => ({
        id: `order-line-${lineIdRef.current++}`,
        productId: item.productId,
        quantity: String(item.quantity),
        discount: String(discount),
      })),
    ]);
    setDraftError("");
  }

  function addDraftLineOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    addDraftLine();
  }

  function updateLine(index: number, next: Partial<OrderLineDraft>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...next } : line)));
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <div className="grid gap-4">
      <input name="productsJson" type="hidden" value={JSON.stringify(payload)} />
      <input name="date" type="hidden" value={date} />
      <input name="observation" type="hidden" value={observation} />
      <input name="priceListOverride" type="hidden" value={activePriceList} />
      <input name="requestedDocument" type="hidden" value={requestedDocument === "habitual" ? "" : requestedDocument} />

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_180px]">
        <Field htmlFor="order-customer" label="Cliente" required>
          <SearchableSelect
            id="order-customer"
            name="customerId"
            options={clientOptions}
            placeholder="Seleccionar cliente"
            required
            value={customerId}
            onChange={(nextCustomerId) => {
              const nextClient = clients.find((client) => client.id === nextCustomerId) ?? null;
              setCustomerId(nextCustomerId);
              setPriceListOverride(resolvePriceListName(nextClient?.priceList, priceListOptions));
              setRequestedDocument("habitual");
            }}
          />
        </Field>
        <Field htmlFor="order-date" label="Fecha de entrega">
          <Input id="order-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </div>

      {selectedClient ? (
        <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Condicion fiscal</div>
            <div className="erp-text-body-sm font-bold">{selectedClient.fiscalCondition || "-"}</div>
          </div>
          <Field htmlFor="order-document" label="Comprobante de este pedido">
            <Select
              id="order-document"
              value={requestedDocument}
              onChange={(event) => setRequestedDocument(event.target.value as "habitual" | "remito" | "factura")}
            >
              <option value="habitual">Habitual: {habitualDocument ? desiredDocumentLabel(habitualDocument) : "sin configurar"}</option>
              <option value="remito">Remito</option>
              <option value="factura">Factura</option>
            </Select>
            <div className="mt-1 text-xs text-[color:var(--muted)]">
              Se aplicará {desiredDocument ? `${desiredDocumentLabel(desiredDocument)} · IVA ${String(vatRate).replace(".", ",")}%` : "el comprobante seleccionado"}. El habitual es solo una sugerencia.
            </div>
          </Field>
          <Field htmlFor="order-price-list" label="Lista">
            <Select
              id="order-price-list"
              value={activePriceList}
              onChange={(event) => setPriceListOverride(event.target.value)}
            >
              {priceListOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name}
                </option>
              ))}
            </Select>
            {customerPriceList && !samePriceListName(customerPriceList, activePriceList) ? (
              <div className="mt-1 text-xs font-semibold text-[color:var(--warning)]">
                Excepción manual. Acuerdo del cliente: {customerPriceList}.
              </div>
            ) : customerPriceList ? (
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                Acuerdo comercial del cliente.
              </div>
            ) : null}
          </Field>
          <div>
            <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Vendedor</div>
            <div className="erp-text-body-sm font-bold">{selectedClient.seller || "-"}</div>
          </div>
        </div>
      ) : null}

      <Card className="overflow-visible shadow-none">
        <CardContent className="grid gap-4 p-4">
          <div className="grid gap-3 rounded-md border border-[color:var(--border)] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[color:var(--muted)]">¿El artículo no figura en el catálogo?</p>
              <Button size="sm" type="button" variant="secondary" onClick={() => setShowNewProduct((current) => !current)}>
                {showNewProduct ? "Cancelar alta" : "+ Crear producto nuevo"}
              </Button>
            </div>
            {showNewProduct ? (
              <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4 md:grid-cols-[minmax(200px,1fr)_150px_150px_auto] md:items-end">
                <Field htmlFor="order-new-product-name" label="Nombre del producto">
                  <Input id="order-new-product-name" maxLength={180} value={newProductName} onChange={(event) => setNewProductName(event.target.value)} />
                </Field>
                <Field htmlFor="order-new-product-cost" label="Costo neto">
                  <Input id="order-new-product-cost" type="number" min="0.01" step="0.01" inputMode="decimal" value={newProductCost} onChange={(event) => setNewProductCost(event.target.value)} />
                </Field>
                <Field htmlFor="order-new-product-margin" label="Margen bruto %">
                  <Input id="order-new-product-margin" type="number" min="0" max="89.99" step="0.01" inputMode="decimal" value={newProductMargin} onChange={(event) => setNewProductMargin(event.target.value)} />
                </Field>
                <Button type="button" disabled={creatingProduct || !newProductName.trim() || Number(newProductCost) <= 0 || newProductMargin === ""} onClick={createNewProduct}>
                  {creatingProduct ? "Guardando…" : "Guardar producto"}
                </Button>
                {Number(newProductCost) > 0 && newProductMargin !== "" && Number(newProductMargin) >= 0 && Number(newProductMargin) < 90 ? (
                  <p className="text-sm font-bold text-[color:var(--accent)] md:col-span-4">
                    Precio neto estimado: {formatCurrency(Number(newProductCost) / (1 - Number(newProductMargin) / 100))}
                  </p>
                ) : null}
                <p className="text-xs text-[color:var(--muted)] md:col-span-4">
                  Precio neto = costo ÷ (1 − margen). El producto se guarda en el catálogo con stock inicial 0 y se selecciona aquí; después indicá la cantidad del pedido.
                </p>
              </div>
            ) : null}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-amber-950">Artículo ocasional · solo para este pedido</p>
                  <p className="text-xs text-amber-900">Figura en el remito y en la ganancia, pero no se incorpora al catálogo ni al stock.</p>
                </div>
                <Button size="sm" type="button" variant="secondary" onClick={() => setShowOccasional((current) => !current)}>
                  {showOccasional ? "Cancelar" : "+ Agregar artículo ocasional"}
                </Button>
              </div>
              {showOccasional ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_90px_130px_130px_130px_auto] xl:items-end">
                  <Field htmlFor="occasional-name" label="Nombre en el remito">
                    <Input id="occasional-name" maxLength={180} value={occasionalDraft.description} onChange={(event) => setOccasionalDraft((current) => ({ ...current, description: event.target.value }))} />
                  </Field>
                  <Field htmlFor="occasional-quantity" label="Cantidad">
                    <Input id="occasional-quantity" type="number" min="1" step="1" value={occasionalDraft.quantity} onChange={(event) => {
                      if (isWholeQuantityInput(event.target.value)) setOccasionalDraft((current) => ({ ...current, quantity: event.target.value }));
                    }} />
                  </Field>
                  <Field htmlFor="occasional-cost" label="Costo neto/u.">
                    <Input id="occasional-cost" type="number" min="0" step="0.01" value={occasionalDraft.unitCost} onChange={(event) => setOccasionalDraft((current) => ({ ...current, unitCost: event.target.value }))} />
                  </Field>
                  <Field htmlFor="occasional-margin" label="Margen bruto %">
                    <Input id="occasional-margin" type="number" min="0" max="89.99" step="0.01" value={occasionalDraft.unitPrice ? roundMoney(occasionalMargin) : ""} onChange={(event) => {
                      const margin = Number(event.target.value);
                      if (event.target.value === "" || !Number.isFinite(margin) || margin < 0 || margin >= 90) return;
                      setOccasionalDraft((current) => ({ ...current, unitPrice: String(roundMoney(numericInput(current.unitCost, 0) / (1 - margin / 100))) }));
                    }} />
                  </Field>
                  <Field htmlFor="occasional-price" label="Precio neto/u.">
                    <Input id="occasional-price" type="number" min="0.01" step="0.01" value={occasionalDraft.unitPrice} onChange={(event) => setOccasionalDraft((current) => ({ ...current, unitPrice: event.target.value }))} />
                  </Field>
                  <Button type="button" disabled={!selectedClient || !occasionalDraft.description.trim() || occasionalDraft.unitCost === "" || occasionalPrice <= 0} onClick={addOccasionalLine}>
                    Agregar
                  </Button>
                  <p className="text-xs text-amber-900 md:col-span-2 xl:col-span-6">Podés indicar el margen para calcular el precio, o escribir directamente el precio neto. No se reserva ni descuenta stock.</p>
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_120px_120px] xl:items-end 2xl:grid-cols-[minmax(320px,1fr)_120px_120px_130px_130px_auto]">
              <Field className="min-w-0" htmlFor="order-product-draft" label="Producto">
                <SearchableSelect
                  className="w-full"
                  id="order-product-draft"
                  options={productOptions}
                  placeholder="Seleccionar producto"
                  compactOptions
                  value={draftLine.productId}
                  onChange={(productId) => updateDraftLine({ productId })}
                />
              </Field>
              <Field htmlFor="order-quantity-draft" label="Cant.">
                <Input
                  className="w-full"
                  id="order-quantity-draft"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  type="number"
                  value={draftLine.quantity}
                  onChange={(event) => {
                    if (isWholeQuantityInput(event.target.value)) {
                      updateDraftLine({ quantity: event.target.value });
                    }
                  }}
                  onKeyDown={addDraftLineOnEnter}
                />
              </Field>
              <Field htmlFor="order-discount-draft" label="Desc. %">
                <Input
                  className="w-full"
                  id="order-discount-draft"
                  max="100"
                  min="0"
                  step="0.01"
                  type="number"
                  value={draftLine.discount}
                  onChange={(event) => updateDraftLine({ discount: event.target.value })}
                  onKeyDown={addDraftLineOnEnter}
                />
              </Field>
              <div>
                <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Unitario neto</div>
                <div className="erp-text-body-sm min-h-[var(--control-height-md)] content-center font-mono font-bold">
                  {formatCurrency(draftUnitPrice)}
                </div>
              </div>
              <div>
                <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Subtotal neto</div>
                <div className="erp-text-body-sm min-h-[var(--control-height-md)] content-center font-mono font-bold">
                  {formatCurrency(draftSubtotal)}
                </div>
              </div>
              <Button className="w-full whitespace-nowrap xl:w-auto" disabled={!canAddLine} type="button" onClick={addDraftLine}>
                Agregar
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[color:var(--muted)]">
              <span>Disponible: {draftProduct ? formatNumber(draftProduct.available) : "-"}</span>
              <span>Presentación: {draftProduct ? `${draftProduct.presentationUnits} u.` : "-"}</span>
              <span>Lista: {activePriceList}</span>
              <span>Enter en cantidad o descuento agrega el producto.</span>
            </div>

            {comboOffers.length > 0 ? (
              <div className="border-t border-[color:var(--border)] pt-3">
                {offerListNames.includes(activePriceList) ? (
                  <details className="relative">
                    <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[9px] border border-[#d9e2ef] bg-white px-3 text-sm font-bold text-[#2563eb] hover:border-[#2563eb]">
                      ＋ Agregar oferta
                    </summary>
                    <div className="absolute z-20 mt-2 grid max-h-72 w-80 gap-1 overflow-y-auto rounded-[10px] border border-[#d9e2ef] bg-white p-2 shadow-[var(--shadow-lg)]">
                      {comboOffers.map((offer) => (
                        <button
                          className="rounded-md px-3 py-2 text-left text-sm hover:bg-[#f1f5f9]"
                          key={offer.id}
                          onClick={() => applyOffer(offer)}
                          type="button"
                        >
                          <div className="font-bold text-[#0f172a]">{offer.name}</div>
                          <div className="text-xs text-[color:var(--muted)]">
                            {offer.items.map((item) => `${formatNumber(item.quantity)}× ${item.productName}`).join(", ")}
                          </div>
                        </button>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="erp-text-caption text-[color:var(--muted)]">
                    La lista <b>{activePriceList}</b> no admite ofertas.
                  </p>
                )}
              </div>
            ) : null}
            {draftError || missingDraftPrice ? (
              <div className="text-sm font-semibold text-[color:var(--danger)]" role="alert">
                {draftError || `El producto no tiene precio para la lista ${activePriceList}.`}
              </div>
            ) : null}
          </div>

          <DataTable caption="Productos del pedido" minWidth="760px" tableLabel="Productos del pedido">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead align="right">Cant.</DataTableHead>
                <DataTableHead align="right">Desc.</DataTableHead>
                <DataTableHead align="right">Unitario neto</DataTableHead>
                <DataTableHead align="right">Subtotal neto</DataTableHead>
                <DataTableHead align="right">Accion</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
                {calculatedLines.length === 0 && calculatedOccasionalLines.length === 0 ? (
                  <DataTableRow>
                    <DataTableCell className="py-6 text-center text-[color:var(--muted)]" colSpan={6}>
                      Sin productos
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  <>
                  {calculatedLines.map((line, index) => (
                    <DataTableRow key={line.id}>
                      <DataTableCell>
                        <div className="max-w-[360px] truncate font-semibold">{line.product.name}</div>
                        <div className="text-xs text-[color:var(--muted)]">
                          {line.product.code || "-"} - Presentación {line.product.presentationUnits} u. - Disp. {formatNumber(line.product.available)}
                        </div>
                        {line.presentationPricing.appliesImprovedPrice ? (
                          <div className="mt-1 text-xs font-semibold text-emerald-700">
                            {line.presentationPricing.improvedQuantity} u. a L1{line.presentationPricing.regularQuantity > 0 ? ` + ${line.presentationPricing.regularQuantity} u. a L2` : ""}
                          </div>
                        ) : null}
                      </DataTableCell>
                      <DataTableCell align="right">
                        <Input
                          aria-label={`Cantidad ${line.product.name}`}
                          className="ml-auto w-24 text-right"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          type="number"
                          value={line.quantity}
                          onChange={(event) => {
                            if (isWholeQuantityInput(event.target.value)) {
                              updateLine(index, { quantity: event.target.value });
                            }
                          }}
                        />
                      </DataTableCell>
                      <DataTableCell align="right">
                        <Input
                          aria-label={`Descuento ${line.product.name}`}
                          className="ml-auto w-24 text-right"
                          max="100"
                          min="0"
                          step="0.01"
                          type="number"
                          value={line.discount}
                          onChange={(event) => updateLine(index, { discount: event.target.value })}
                        />
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono font-semibold">
                        {formatCurrency(line.unitPrice)}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono font-bold">
                        {formatCurrency(line.subtotal)}
                      </DataTableCell>
                      <DataTableCell align="right">
                        <Button size="sm" type="button" variant="secondary" onClick={() => removeLine(index)}>
                          Quitar
                        </Button>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                  {calculatedOccasionalLines.map((line, index) => (
                    <DataTableRow key={line.id}>
                      <DataTableCell>
                        <div className="max-w-[360px] truncate font-semibold">{line.description}</div>
                        <div className="text-xs font-semibold text-amber-700">Artículo ocasional · sin catálogo ni stock</div>
                      </DataTableCell>
                      <DataTableCell align="right">
                        <Input
                          aria-label={`Cantidad ${line.description}`}
                          className="ml-auto w-24 text-right"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          type="number"
                          value={line.quantity}
                          onChange={(event) => {
                            if (isWholeQuantityInput(event.target.value)) {
                              setOccasionalLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item));
                            }
                          }}
                        />
                      </DataTableCell>
                      <DataTableCell align="right">
                        <Input
                          aria-label={`Descuento ${line.description}`}
                          className="ml-auto w-24 text-right"
                          max="100"
                          min="0"
                          step="0.01"
                          type="number"
                          value={line.discount}
                          onChange={(event) => setOccasionalLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, discount: event.target.value } : item))}
                        />
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono font-semibold">{formatCurrency(line.unitPrice)}</DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono font-bold">{formatCurrency(line.subtotal)}</DataTableCell>
                      <DataTableCell align="right">
                        <Button size="sm" type="button" variant="secondary" onClick={() => setOccasionalLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar</Button>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                  </>
                )}
            </DataTableBody>
          </DataTable>
          {lowMarginLines.length > 0 ? (
            <div
              className={`rounded-lg border p-4 ${orderMarginRisk === "critical" ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
              role="alert"
            >
              <div className="font-black">
                {orderMarginRisk === "critical" ? "Margen crítico" : "Margen potencialmente bajo"} · pedido {orderMarginPercent.toFixed(1).replace(".", ",")}%
              </div>
              <p className="mt-1 text-sm">
                La venta se puede registrar igualmente. Revisá precio, descuento y lista antes de continuar.
              </p>
              <ul className="mt-2 grid gap-1 text-sm">
                {lowMarginLines.map((line) => (
                  <li key={line.id}>
                    <b>{line.name}</b>: {line.marginPercent.toFixed(1).replace(".", ",")}% de margen
                    {line.discount > 0 ? ` · ${line.discount}% de descuento` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_320px]">
        <Field htmlFor="order-observation" label="Observacion">
          <textarea
            className="erp-text-body-sm min-h-24 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--field)] px-3 py-2 text-[color:var(--foreground)] shadow-[var(--shadow-control)] outline-none focus:border-[color:var(--accent)]"
            id="order-observation"
            suppressHydrationWarning
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
          />
        </Field>
        <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="erp-text-body-sm text-[color:var(--muted)]">Subtotal neto</span>
              <span className="font-mono font-bold">{formatCurrency(orderTotals.net)}</span>
            </div>
            {hasConfiguredDocument ? (
              <div className="flex items-center justify-between">
                <span className="erp-text-body-sm text-[color:var(--muted)]">
                  IVA {String(vatRate).replace(".", ",")}%
                </span>
                <span className="font-mono font-bold">{formatCurrency(orderTotals.vat)}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[color:var(--danger)]">
                <span className="erp-text-body-sm font-semibold">IVA pendiente</span>
                <span className="erp-text-body-sm font-semibold">Configurar cliente</span>
              </div>
            )}
            <div className="border-t border-[color:var(--border)] pt-3">
              <div className="flex items-center justify-between">
                <span className="erp-text-body font-black">Total final</span>
                <span className="font-mono text-xl font-black">
                  {hasConfiguredDocument ? formatCurrency(orderTotals.total) : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <OrderConfirmationPreview
        address={selectedClient?.address ?? ""}
        businessName={selectedClient?.name ?? ""}
        deliveryDate={date}
        lines={calculatedLines
          .filter((line) => line.quantity > 0)
          .map((line) => ({ quantity: line.quantity, name: line.product.name }))
          .concat(calculatedOccasionalLines.filter((line) => line.quantity > 0).map((line) => ({ quantity: line.quantity, name: line.description })))}
        offers={offers}
        pricedLines={pricedLines}
        offersEnabled={offersEnabled}
        offersRemaining={offersRemaining}
        phone={selectedClient?.phone ?? ""}
        ready={canSubmit}
        ivaRate={vatRate}
        desiredDocument={desiredDocument}
        pricingSuggestions={pricingSuggestions}
      />

      <Button disabled={!canSubmit} type="submit">
        {submitLabel}
      </Button>
    </div>
  );
}
