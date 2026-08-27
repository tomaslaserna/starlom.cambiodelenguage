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
import { DEFAULT_PRICE_LIST_NAME, priceForList, resolvePriceListName } from "@/lib/order-pricing";
import { presentationPriceForLine, presentationSuggestion } from "@/lib/presentation-pricing";
import { offerLineDiscount } from "@/lib/offer-status";
import type { PriceOffer } from "@/lib/price-offers";
import { localDateIso } from "@/lib/timezone";
import { desiredDocumentLabel, invoiceSaleOrderDocument, saleOrderDocument, saleVatRateForDocument } from "@/lib/receipt-types";
import type { OrderFormClient, OrderFormPriceList, OrderFormProduct } from "@/lib/orders";
import { OrderConfirmationPreview } from "@/app/orders/new/order-confirmation-preview";
import type { IvaRate } from "@/lib/order-confirmation";
import { vatAmountsFromNet } from "@/lib/vat-calculation";

type OrderLineDraft = {
  productId: string;
  quantity: string;
  discount: string;
};

type OrderLineState = OrderLineDraft & {
  id: string;
};

export type OrderEntryInitialValue = {
  customerId: string;
  date: string;
  observation: string;
  priceListOverride: string;
  vatRate?: number;
  lines: OrderLineDraft[];
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
  const [date, setDate] = useState(() => initialValue?.date || localDateIso());
  const [observation, setObservation] = useState(initialValue?.observation ?? "");
  const [priceListOverride, setPriceListOverride] = useState(initialValue?.priceListOverride ?? "");
  const [requestedDocument, setRequestedDocument] = useState<"habitual" | "remito" | "factura">("habitual");
  const [draftError, setDraftError] = useState("");
  const lineIdRef = useRef(initialValue?.lines.length ?? 0);

  const selectedClient = clients.find((client) => client.id === customerId) ?? null;
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
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
  const activePriceList = resolvePriceListName(priceListOverride || selectedClient?.priceList, priceListOptions);
  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        description: `${product.code || "Sin codigo"} - Presentación: ${product.presentationUnits} u. - Disponible: ${formatNumber(product.available)} - Precio neto: ${formatCurrency(priceForList(product.prices, activePriceList))}`,
        searchText: product.code,
      })),
    [activePriceList, products],
  );

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
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  const netAmount = calculatedLines.reduce((total, line) => total + line.subtotal, 0);
  const orderTotals = vatAmountsFromNet(netAmount, vatRate);
  const pricedLines = calculatedLines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      quantity: line.quantity,
      name: line.product.name,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
    }));
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
    && calculatedLines.some((line) => line.quantity > 0)
    && hasConfiguredDocument
    && (initialValue?.vatRate === undefined || initialValue.vatRate > 0);

  const payload = calculatedLines.map((line) => ({
    productId: line.product.id,
    quantity: line.quantity,
    discount: line.discount,
  }));

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
        const product = products.find((candidate) => candidate.id === item.productId);
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
            {selectedClient.priceList && selectedClient.priceList !== activePriceList ? (
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                Sugerida por cliente: {activePriceList}
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
                {calculatedLines.length === 0 ? (
                  <DataTableRow>
                    <DataTableCell className="py-6 text-center text-[color:var(--muted)]" colSpan={6}>
                      Sin productos
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  calculatedLines.map((line, index) => (
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
                  ))
                )}
            </DataTableBody>
          </DataTable>
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
          .map((line) => ({ quantity: line.quantity, name: line.product.name }))}
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
