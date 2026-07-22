"use client";

import { useMemo, useRef, useState } from "react";
import {
  Button,
  ButtonLink,
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
import { DEFAULT_PRICE_LIST_NAME, lineSubtotal, priceForList, resolvePriceListName } from "@/lib/order-pricing";
import { normalizeOrderCreationDocument, desiredDocumentLabel } from "@/lib/receipt-types";
import type { OrderFormClient, OrderFormPriceList, OrderFormProduct } from "@/lib/orders";
import { calculateQuoteTotals, type QuoteVatRate } from "@/lib/quote-totals";

type QuoteLineDraft = {
  productId: string;
  quantity: string;
  discount: string;
};

type QuoteLineState = QuoteLineDraft & {
  id: string;
};

type QuoteEntryFieldsProps = {
  clients: OrderFormClient[];
  priceLists: OrderFormPriceList[];
  products: OrderFormProduct[];
};

type CustomerMode = "registered" | "occasional";

type OccasionalCustomer = {
  name: string;
  businessName: string;
  taxId: string;
  vatCondition: string;
  phone: string;
  address: string;
};

const emptyLine = (): QuoteLineDraft => ({ productId: "", quantity: "1", discount: "0" });

function numericInput(value: string, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function isWholeQuantityInput(value: string) {
  return value === "" || /^\d+$/.test(value);
}

function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("54")) return digits;
  return `54${digits.replace(/^0+/, "")}`;
}

export function QuoteEntryFields({ clients, priceLists, products }: QuoteEntryFieldsProps) {
  const [customerMode, setCustomerMode] = useState<CustomerMode>("registered");
  const [customerId, setCustomerId] = useState("");
  const [occasionalCustomer, setOccasionalCustomer] = useState<OccasionalCustomer>({
    name: "",
    businessName: "",
    taxId: "",
    vatCondition: "",
    phone: "",
    address: "",
  });
  const [validityDays, setValidityDays] = useState("15");
  const [priceListOverride, setPriceListOverride] = useState("");
  const [vatRate, setVatRate] = useState<QuoteVatRate>(0);
  const [draftLine, setDraftLine] = useState<QuoteLineDraft>(emptyLine());
  const [lines, setLines] = useState<QuoteLineState[]>([]);
  const lineIdRef = useRef(0);

  const selectedClient = clients.find((client) => client.id === customerId) ?? null;
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.name,
        description: [client.taxId, client.legalName !== client.name ? client.legalName : ""].filter(Boolean).join(" - "),
        searchText: [client.legalName, client.taxId, client.phone, client.seller].filter(Boolean).join(" "),
      })),
    [clients],
  );
  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        description: `${product.code || "Sin codigo"} - Disponible: ${formatNumber(product.available)}`,
        searchText: product.code,
      })),
    [products],
  );
  const priceListOptions = priceLists.length ? priceLists : [{ name: DEFAULT_PRICE_LIST_NAME }];
  const activePriceList = resolvePriceListName(priceListOverride || selectedClient?.priceList, priceListOptions);
  const occasionalName = occasionalCustomer.name.trim() || occasionalCustomer.businessName.trim();
  const customerReady = customerMode === "registered" ? Boolean(selectedClient) : Boolean(occasionalName);
  const quoteCustomerName = selectedClient?.name || occasionalName;
  const quoteCustomerPhone = selectedClient?.phone || occasionalCustomer.phone;
  const suggestedDocument = selectedClient
    ? normalizeOrderCreationDocument(selectedClient.receiptType, selectedClient.fiscalCondition)
    : "remito";

  const calculatedLines = lines
    .map((line) => {
      const product = productMap.get(line.productId);
      if (!product || !customerReady) return null;
      const quantity = Math.max(0, Math.trunc(numericInput(line.quantity, 0)));
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
  const quoteTotals = calculateQuoteTotals(totalAmount, vatRate);
  const vatAmount = quoteTotals.vatAmount;
  const quoteTotal = quoteTotals.total;
  const draftProduct = productMap.get(draftLine.productId) ?? null;
  const draftQuantity = Math.max(0, Math.trunc(numericInput(draftLine.quantity, 0)));
  const draftDiscount = Math.min(100, Math.max(0, numericInput(draftLine.discount, 0)));
  const draftUnitPrice = draftProduct && customerReady ? priceForList(draftProduct.prices, activePriceList) : 0;
  const draftSubtotal = draftProduct ? lineSubtotal(draftUnitPrice, draftQuantity, draftDiscount) : 0;
  const canAddLine = Boolean(customerReady && draftProduct && draftQuantity > 0);
  const payload = calculatedLines.map((line) => ({
    productId: line.product.id,
    quantity: line.quantity,
    discount: line.discount,
  }));
  const canSendQuickQuote = Boolean(customerReady && calculatedLines.length && quoteTotal > 0);
  const quickQuoteText = customerReady
    ? [
        `Hola ${quoteCustomerName}, te paso presupuesto rapido de Starlim:`,
        "",
        ...calculatedLines.map(
          (line) =>
            `- ${formatNumber(line.quantity)} x ${line.product.name}: ${formatCurrency(line.subtotal)}`,
        ),
        "",
        `Lista: ${activePriceList}`,
        `Subtotal: ${formatCurrency(totalAmount)}`,
        ...(vatRate > 0 ? [`IVA ${String(vatRate).replace(".", ",")}%: ${formatCurrency(vatAmount)}`] : []),
        `Total: ${formatCurrency(quoteTotal)}`,
        vatRate > 0 ? "Precios antes de IVA." : "Precios finales.",
        `Vigencia: ${validityDays || "15"} dias`,
      ].join("\n")
    : "";
  const quickQuotePhone = customerReady ? whatsappPhone(quoteCustomerPhone) : "";
  const quickQuoteHref = canSendQuickQuote
    ? quickQuotePhone
      ? `https://wa.me/${quickQuotePhone}?text=${encodeURIComponent(quickQuoteText)}`
      : `https://wa.me/?text=${encodeURIComponent(quickQuoteText)}`
    : "";

  function updateDraftLine(next: Partial<QuoteLineDraft>) {
    setDraftLine((current) => ({ ...current, ...next }));
  }

  function updateOccasionalCustomer(next: Partial<OccasionalCustomer>) {
    setOccasionalCustomer((current) => ({ ...current, ...next }));
  }

  function addDraftLine() {
    if (!canAddLine) return;
    setLines((current) => [
      ...current,
      {
        id: `quote-line-${lineIdRef.current++}`,
        productId: draftLine.productId,
        quantity: String(draftQuantity),
        discount: String(draftDiscount),
      },
    ]);
    setDraftLine(emptyLine());
  }

  function updateLine(index: number, next: Partial<QuoteLineDraft>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...next } : line)));
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <div className="grid gap-4">
      <input name="productsJson" type="hidden" value={JSON.stringify(payload)} />
      <input name="priceListOverride" type="hidden" value={activePriceList} />
      <input name="validityDays" type="hidden" value={validityDays} />
      <input name="includeVat" type="hidden" value={String(vatRate > 0)} />

      <div className="grid gap-4 xl:grid-cols-[190px_minmax(280px,1fr)_150px_210px]">
        <Field htmlFor="quote-customer-mode" label="Tipo de cliente">
          <Select
            id="quote-customer-mode"
            value={customerMode}
            onChange={(event) => {
              const nextMode = event.target.value as CustomerMode;
              setCustomerMode(nextMode);
              setCustomerId("");
              setPriceListOverride(resolvePriceListName("", priceListOptions));
            }}
          >
            <option value="registered">Cliente cargado</option>
            <option value="occasional">Cliente ocasional</option>
          </Select>
        </Field>
        {customerMode === "registered" ? (
          <Field htmlFor="quote-customer" label="Cliente" required>
            <SearchableSelect
              id="quote-customer"
              name="customerId"
              options={clientOptions}
              placeholder="Buscar cliente cargado"
              required
              value={customerId}
              onChange={(nextCustomerId) => {
                const nextClient = clients.find((client) => client.id === nextCustomerId) ?? null;
                setCustomerId(nextCustomerId);
                setPriceListOverride(resolvePriceListName(nextClient?.priceList, priceListOptions));
              }}
            />
          </Field>
        ) : (
          <Field htmlFor="quote-customer-name" label="Nombre del cliente" required>
            <Input
              id="quote-customer-name"
              maxLength={255}
              name="customerName"
              placeholder="Persona o comercio"
              required
              value={occasionalCustomer.name}
              onChange={(event) => updateOccasionalCustomer({ name: event.target.value })}
            />
          </Field>
        )}
        <Field htmlFor="quote-validity" label="Vigencia">
          <Input
            id="quote-validity"
            max="365"
            min="1"
            step="1"
            type="number"
            value={validityDays}
            onChange={(event) => setValidityDays(event.target.value)}
          />
        </Field>
        <Field htmlFor="quote-vat-rate" label="IVA en presupuesto">
          <Select
            id="quote-vat-rate"
            name="vatRate"
            value={String(vatRate)}
            onChange={(event) => setVatRate(Number(event.target.value) as QuoteVatRate)}
          >
            <option value="0">No mostrar IVA</option>
            <option value="21">Sumar IVA 21%</option>
            <option value="10.5">Sumar IVA 10,5%</option>
          </Select>
        </Field>
      </div>

      {customerMode === "occasional" ? (
        <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4 md:grid-cols-2 xl:grid-cols-3">
          <Field htmlFor="quote-customer-business-name" label="Razon social (opcional)">
            <Input
              id="quote-customer-business-name"
              maxLength={255}
              name="customerBusinessName"
              value={occasionalCustomer.businessName}
              onChange={(event) => updateOccasionalCustomer({ businessName: event.target.value })}
            />
          </Field>
          <Field htmlFor="quote-customer-tax-id" label="CUIT/DNI (opcional)">
            <Input
              id="quote-customer-tax-id"
              maxLength={32}
              name="customerTaxId"
              value={occasionalCustomer.taxId}
              onChange={(event) => updateOccasionalCustomer({ taxId: event.target.value })}
            />
          </Field>
          <Field htmlFor="quote-customer-vat-condition" label="Condicion IVA (opcional)">
            <Input
              id="quote-customer-vat-condition"
              maxLength={120}
              name="customerVatCondition"
              value={occasionalCustomer.vatCondition}
              onChange={(event) => updateOccasionalCustomer({ vatCondition: event.target.value })}
            />
          </Field>
          <Field htmlFor="quote-customer-phone" label="Telefono (opcional)">
            <Input
              id="quote-customer-phone"
              maxLength={64}
              name="customerPhone"
              value={occasionalCustomer.phone}
              onChange={(event) => updateOccasionalCustomer({ phone: event.target.value })}
            />
          </Field>
          <Field className="xl:col-span-1" htmlFor="quote-customer-address" label="Direccion (opcional)">
            <Input
              id="quote-customer-address"
              maxLength={500}
              name="customerAddress"
              value={occasionalCustomer.address}
              onChange={(event) => updateOccasionalCustomer({ address: event.target.value })}
            />
          </Field>
          <Field htmlFor="quote-price-list-occasional" label="Lista de precios">
            <Select
              id="quote-price-list-occasional"
              value={activePriceList}
              onChange={(event) => setPriceListOverride(event.target.value)}
            >
              {priceListOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-[color:var(--muted)] md:col-span-2 xl:col-span-3">
            Este presupuesto no crea una ficha de cliente. Podras cargarla cuando confirme su primera compra.
          </p>
        </div>
      ) : selectedClient ? (
        <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Razon social</div>
            <div className="erp-text-body-sm font-bold">{selectedClient.legalName || selectedClient.name}</div>
          </div>
          <div>
            <div className="erp-text-caption font-semibold text-[color:var(--muted)]">CUIT/DNI</div>
            <div className="erp-text-body-sm font-mono font-bold">{selectedClient.taxId || "-"}</div>
          </div>
          <div>
            <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Condicion IVA</div>
            <div className="erp-text-body-sm font-bold">{selectedClient.fiscalCondition || "-"}</div>
          </div>
          <div>
            <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Comprobante</div>
            <div className="erp-text-body-sm font-bold">{desiredDocumentLabel(suggestedDocument)}</div>
          </div>
          <div>
            <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Telefono</div>
            <div className="erp-text-body-sm font-bold">{selectedClient.phone || "-"}</div>
          </div>
          <div>
            <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Direccion</div>
            <div className="erp-text-body-sm font-bold">{selectedClient.address || "-"}</div>
          </div>
          <Field htmlFor="quote-price-list" label="Lista de precios">
            <Select
              id="quote-price-list"
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
        </div>
      ) : null}

      <div className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-white p-4">
        <div className="grid gap-3 rounded-md border border-[color:var(--border)] bg-white p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(320px,1fr)_120px_120px_130px_130px_auto] xl:items-end">
            <Field className="min-w-0" htmlFor="quote-product-draft" label="Producto">
              <SearchableSelect
                className="w-full"
                id="quote-product-draft"
                options={productOptions}
                placeholder="Seleccionar producto"
                value={draftLine.productId}
                onChange={(productId) => updateDraftLine({ productId })}
              />
            </Field>
            <Field htmlFor="quote-quantity-draft" label="Cant.">
              <Input
                className="w-full"
                id="quote-quantity-draft"
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
              />
            </Field>
            <Field htmlFor="quote-discount-draft" label="Desc. %">
              <Input
                className="w-full"
                id="quote-discount-draft"
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

        <DataTable caption="Productos del presupuesto" minWidth="760px" tableLabel="Productos del presupuesto">
          <DataTableHeader>
            <DataTableRow className="hover:bg-transparent">
              <DataTableHead>Producto</DataTableHead>
              <DataTableHead align="right">Cant.</DataTableHead>
              <DataTableHead align="right">Desc.</DataTableHead>
              <DataTableHead align="right">Unitario</DataTableHead>
              <DataTableHead align="right">Subtotal</DataTableHead>
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
                        {line.product.code || "-"} - Disp. {formatNumber(line.product.available)}
                      </div>
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_320px]">
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4">
          <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Vendedor</div>
          <div className="erp-text-body-sm font-bold">
            {selectedClient?.seller || (customerMode === "occasional" ? "Usuario actual" : "-")}
          </div>
        </div>
        <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="erp-text-body-sm text-[color:var(--muted)]">Subtotal productos</span>
              <span className="font-mono font-bold">{formatCurrency(totalAmount)}</span>
            </div>
            {vatRate > 0 ? (
              <div className="flex items-center justify-between">
                <span className="erp-text-body-sm text-[color:var(--muted)]">
                  IVA {String(vatRate).replace(".", ",")}%
                </span>
                <span className="font-mono font-bold">{formatCurrency(vatAmount)}</span>
              </div>
            ) : null}
            <div className="border-t border-[color:var(--border)] pt-3">
              <div className="flex items-center justify-between">
                <span className="erp-text-body font-black">Total</span>
                <span className="font-mono text-xl font-black">{formatCurrency(quoteTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-end gap-2 sm:flex-row">
        {canSendQuickQuote ? (
          <ButtonLink href={quickQuoteHref} prefetch={false} rel="noreferrer" target="_blank" variant="outline">
            WhatsApp rapido
          </ButtonLink>
        ) : (
          <Button disabled type="button" variant="outline">
            WhatsApp rapido
          </Button>
        )}
        <Button disabled={!customerReady || calculatedLines.length === 0} type="submit">
          Crear presupuesto formal
        </Button>
      </div>
    </div>
  );
}
