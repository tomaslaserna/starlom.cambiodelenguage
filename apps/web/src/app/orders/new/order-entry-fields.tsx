"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Card, CardContent, Field, Input, Select } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import { DEFAULT_PRICE_LIST_NAME, lineSubtotal, priceForList, resolvePriceListName } from "@/lib/order-pricing";
import { localDateIso } from "@/lib/timezone";
import { ORDER_CREATION_RECEIPT_OPTIONS, normalizeOrderCreationDocument } from "@/lib/receipt-types";
import type { OrderFormClient, OrderFormPriceList, OrderFormProduct } from "@/lib/orders";
import { OrderConfirmationPreview } from "@/app/orders/new/order-confirmation-preview";

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
  desiredDocumentOverride: string;
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
};

const emptyLine = (): OrderLineDraft => ({ productId: "", quantity: "1", discount: "0" });

function numericInput(value: string, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function OrderEntryFields({
  clients,
  priceLists,
  products,
  initialValue,
  offers = [],
  offersEnabled = true,
  offersRemaining = 0,
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
  const [documentOverride, setDocumentOverride] = useState(initialValue?.desiredDocumentOverride ?? "");
  const lineIdRef = useRef(initialValue?.lines.length ?? 0);

  const selectedClient = clients.find((client) => client.id === customerId) ?? null;
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const priceListOptions = priceLists.length ? priceLists : [{ name: DEFAULT_PRICE_LIST_NAME }];
  const suggestedDocument = selectedClient
    ? normalizeOrderCreationDocument(selectedClient.receiptType, selectedClient.fiscalCondition)
    : "remito";
  const desiredDocument = documentOverride || suggestedDocument;
  const activePriceList = resolvePriceListName(priceListOverride || selectedClient?.priceList, priceListOptions);

  const calculatedLines = lines
    .map((line) => {
      const product = productMap.get(line.productId);
      if (!product || !selectedClient) return null;
      const quantity = Math.max(0, numericInput(line.quantity, 0));
      const discount = Math.min(100, Math.max(0, numericInput(line.discount, 0)));
      const unitPrice = priceForList(product.prices, activePriceList);
      return {
        ...line,
        product,
        quantity,
        discount,
        unitPrice,
        subtotal: lineSubtotal(unitPrice, quantity, discount),
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));

  const totalAmount = calculatedLines.reduce((total, line) => total + line.subtotal, 0);
  const pricedLines = calculatedLines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      quantity: line.quantity,
      name: line.product.name,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
    }));
  const draftProduct = productMap.get(draftLine.productId) ?? null;
  const draftQuantity = Math.max(0, numericInput(draftLine.quantity, 0));
  const draftDiscount = Math.min(100, Math.max(0, numericInput(draftLine.discount, 0)));
  const draftUnitPrice = draftProduct && selectedClient ? priceForList(draftProduct.prices, activePriceList) : 0;
  const draftSubtotal = draftProduct ? lineSubtotal(draftUnitPrice, draftQuantity, draftDiscount) : 0;
  const canAddLine = Boolean(selectedClient && draftProduct && draftQuantity > 0);

  const payload = calculatedLines.map((line) => ({
    productId: line.product.id,
    quantity: line.quantity,
    discount: line.discount,
  }));

  function updateDraftLine(next: Partial<OrderLineDraft>) {
    setDraftLine((current) => ({ ...current, ...next }));
  }

  function addDraftLine() {
    if (!canAddLine) return;
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
      <input name="desiredDocumentOverride" type="hidden" value={desiredDocument} />

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_180px]">
        <Field htmlFor="order-customer" label="Cliente" required>
          <Select
            id="order-customer"
            name="customerId"
            required
            value={customerId}
            onChange={(event) => {
              const nextClient = clients.find((client) => client.id === event.target.value) ?? null;
              setCustomerId(event.target.value);
              setPriceListOverride(resolvePriceListName(nextClient?.priceList, priceListOptions));
              setDocumentOverride(
                nextClient ? normalizeOrderCreationDocument(nextClient.receiptType, nextClient.fiscalCondition) : "remito",
              );
            }}
          >
            <option value="">Seleccionar cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} {client.taxId ? `- ${client.taxId}` : ""}
              </option>
            ))}
          </Select>
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
          <Field htmlFor="order-document" label="Comprobante">
            <Select
              id="order-document"
              value={desiredDocument}
              onChange={(event) => setDocumentOverride(event.target.value)}
            >
              {ORDER_CREATION_RECEIPT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
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

      <Card className="shadow-none">
        <CardContent className="grid gap-4 p-4">
          <div className="grid gap-3 rounded-md border border-[color:var(--border)] bg-white p-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(320px,1fr)_120px_120px_130px_130px_auto] xl:items-end">
              <Field className="min-w-0" htmlFor="order-product-draft" label="Producto">
                <Select
                  className="w-full"
                  id="order-product-draft"
                  value={draftLine.productId}
                  onChange={(event) => updateDraftLine({ productId: event.target.value })}
                >
                  <option value="">Seleccionar producto</option>
                  {products.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} {option.code ? `(${option.code})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="order-quantity-draft" label="Cant.">
                <Input
                  className="w-full"
                  id="order-quantity-draft"
                  min="0.001"
                  step="0.001"
                  type="number"
                  value={draftLine.quantity}
                  onChange={(event) => updateDraftLine({ quantity: event.target.value })}
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
                />
              </Field>
              <div>
                <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Unitario</div>
                <div className="erp-text-body-sm min-h-[var(--control-height-md)] content-center font-mono font-bold">
                  {formatCurrency(draftUnitPrice)}
                </div>
              </div>
              <div>
                <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Subtotal</div>
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
              <span>Lista: {activePriceList}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-[color:var(--border)]">
            <table className="w-full min-w-[760px] border-collapse bg-white text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-left text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-bold">Producto</th>
                  <th className="px-3 py-2 text-right font-bold">Cant.</th>
                  <th className="px-3 py-2 text-right font-bold">Desc.</th>
                  <th className="px-3 py-2 text-right font-bold">Unitario</th>
                  <th className="px-3 py-2 text-right font-bold">Subtotal</th>
                  <th className="px-3 py-2 text-right font-bold">Accion</th>
                </tr>
              </thead>
              <tbody>
                {calculatedLines.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-[color:var(--muted)]" colSpan={6}>
                      Sin productos
                    </td>
                  </tr>
                ) : (
                  calculatedLines.map((line, index) => (
                    <tr className="border-t border-[color:var(--border)]" key={line.id}>
                      <td className="px-3 py-2">
                        <div className="max-w-[360px] truncate font-semibold">{line.product.name}</div>
                        <div className="text-xs text-[color:var(--muted)]">
                          {line.product.code || "-"} - Disp. {formatNumber(line.product.available)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          aria-label={`Cantidad ${line.product.name}`}
                          className="ml-auto w-24 text-right"
                          min="0.001"
                          step="0.001"
                          type="number"
                          value={line.quantity}
                          onChange={(event) => updateLine(index, { quantity: event.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
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
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-bold">
                        {formatCurrency(line.subtotal)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" type="button" variant="secondary" onClick={() => removeLine(index)}>
                          Quitar
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
              <span className="erp-text-body-sm text-[color:var(--muted)]">Subtotal productos</span>
              <span className="font-mono font-bold">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="border-t border-[color:var(--border)] pt-3">
              <div className="flex items-center justify-between">
                <span className="erp-text-body font-black">Total</span>
                <span className="font-mono text-xl font-black">{formatCurrency(totalAmount)}</span>
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
        ready={Boolean(selectedClient) && calculatedLines.some((line) => line.quantity > 0)}
      />
    </div>
  );
}
