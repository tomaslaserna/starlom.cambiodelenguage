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
  Textarea,
} from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import { DEFAULT_PRICE_LIST_NAME, lineSubtotal, priceForList, resolvePriceListName } from "@/lib/order-pricing";
import { desiredDocumentLabel, saleOrderDocument, saleVatRateForDocument } from "@/lib/receipt-types";
import type { OrderFormClient, OrderFormPriceList, OrderFormProduct } from "@/lib/orders";
import { vatAmountsFromNet } from "@/lib/vat-calculation";

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
  vendors: { id: string; name: string }[];
  initialValues?: {
    customerId: string;
    validityDays: string;
    priceListOverride: string;
    assignedSellerId?: string;
    lines: { productId: string; quantity: string; discount: string }[];
  };
  mode?: "create" | "edit";
  quoteId?: string;
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

export function QuoteEntryFields({
  clients,
  priceLists,
  products,
  vendors,
  initialValues,
  mode = "create",
  quoteId,
}: QuoteEntryFieldsProps) {
  const isEdit = mode === "edit";
  const [customerId, setCustomerId] = useState(initialValues?.customerId ?? "");
  const [validityDays, setValidityDays] = useState(initialValues?.validityDays ?? "15");
  const [priceListOverride, setPriceListOverride] = useState(initialValues?.priceListOverride ?? "");
  const [assignedSellerId, setAssignedSellerId] = useState(initialValues?.assignedSellerId ?? "");
  const [draftLine, setDraftLine] = useState<QuoteLineDraft>(emptyLine());
  const [lines, setLines] = useState<QuoteLineState[]>(
    () => (initialValues?.lines ?? []).map((line, index) => ({ id: `quote-line-init-${index}`, ...line })),
  );
  const [isQuickQuoteMessageEditing, setIsQuickQuoteMessageEditing] = useState(false);
  const [quickQuoteMessageOverride, setQuickQuoteMessageOverride] = useState<{
    source: string;
    text: string;
  } | null>(null);
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
  const desiredDocument = saleOrderDocument(selectedClient?.receiptType);
  const vatRate = saleVatRateForDocument(selectedClient?.receiptType);
  const hasConfiguredDocument = desiredDocument !== null && vatRate !== null;
  const customerReady = Boolean(selectedClient) && hasConfiguredDocument;
  const quoteCustomerName = selectedClient?.name ?? "";
  const quoteCustomerPhone = selectedClient?.phone ?? "";

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
  const quoteTotals = vatAmountsFromNet(totalAmount, vatRate ?? 0);
  const vatAmount = quoteTotals.vat;
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
  const canComposeQuickQuote = Boolean(customerReady && calculatedLines.length && quoteTotal > 0);
  const generatedQuickQuoteText = customerReady
    ? [
        `Hola ${quoteCustomerName}, te paso presupuesto rapido de Starlim:`,
        "",
        ...calculatedLines.map(
          (line) =>
            `- ${formatNumber(line.quantity)} x ${line.product.name}: ${formatCurrency(line.subtotal)}`,
        ),
        "",
        `Lista: ${activePriceList}`,
        `Subtotal neto: ${formatCurrency(totalAmount)}`,
        `IVA ${String(vatRate ?? 0).replace(".", ",")}%: ${formatCurrency(vatAmount)}`,
        `Total final: ${formatCurrency(quoteTotal)}`,
        "Precios netos con IVA discriminado.",
        `Vigencia: ${validityDays || "15"} dias`,
      ].join("\n")
    : "";
  const quickQuoteText =
    quickQuoteMessageOverride?.source === generatedQuickQuoteText
      ? quickQuoteMessageOverride.text
      : generatedQuickQuoteText;
  const canSendQuickQuote = Boolean(canComposeQuickQuote && quickQuoteText.trim());
  const quickQuotePhone = customerReady ? whatsappPhone(quoteCustomerPhone) : "";
  const quickQuoteHref = canSendQuickQuote
    ? quickQuotePhone
      ? `https://wa.me/${quickQuotePhone}?text=${encodeURIComponent(quickQuoteText)}`
      : `https://wa.me/?text=${encodeURIComponent(quickQuoteText)}`
    : "";

  function updateDraftLine(next: Partial<QuoteLineDraft>) {
    setDraftLine((current) => ({ ...current, ...next }));
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
      {isEdit && quoteId ? <input name="quoteId" type="hidden" value={quoteId} /> : null}
      <input name="productsJson" type="hidden" value={JSON.stringify(payload)} />
      <input name="priceListOverride" type="hidden" value={activePriceList} />
      <input name="validityDays" type="hidden" value={validityDays} />
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_150px_210px]">
        <Field htmlFor="quote-customer" label="Cliente cargado" required>
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
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] px-3 py-2">
          <div className="erp-text-caption font-semibold text-[color:var(--muted)]">Comprobante e IVA</div>
          <div className="erp-text-body-sm font-bold">
            {desiredDocument && vatRate
              ? `${desiredDocumentLabel(desiredDocument)} · IVA ${String(vatRate).replace(".", ",")}%`
              : "Sin configurar"}
          </div>
        </div>
      </div>

      <Field htmlFor="quote-assigned-seller" label="Asignar a">
        <Select
          id="quote-assigned-seller"
          name="assignedSellerId"
          value={assignedSellerId}
          onChange={(event) => setAssignedSellerId(event.target.value)}
        >
          <option value="">Todos los vendedores</option>
          {assignedSellerId && !vendors.some((vendor) => vendor.id === assignedSellerId) ? (
            <option value={assignedSellerId}>Vendedor asignado</option>
          ) : null}
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
          ))}
        </Select>
      </Field>

      {selectedClient ? (
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
            <div className="erp-text-body-sm font-bold">
              {desiredDocument ? desiredDocumentLabel(desiredDocument) : "Sin configurar"}
            </div>
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

      {selectedClient && !hasConfiguredDocument ? (
        <p className="rounded-md border border-[color:var(--danger)]/30 bg-white p-3 text-sm font-semibold text-[color:var(--danger)]">
          Configurá al cliente con Remito, Factura A o Factura B antes de crear el presupuesto.
        </p>
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
            <span>Lista: {activePriceList}</span>
          </div>
        </div>

        <DataTable caption="Productos del presupuesto" minWidth="760px" tableLabel="Productos del presupuesto">
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
            {selectedClient?.seller || "-"}
          </div>
        </div>
        <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="erp-text-body-sm text-[color:var(--muted)]">Subtotal neto</span>
              <span className="font-mono font-bold">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="erp-text-body-sm text-[color:var(--muted)]">
                {vatRate ? `IVA ${String(vatRate).replace(".", ",")}%` : "IVA pendiente"}
              </span>
              <span className="font-mono font-bold">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="border-t border-[color:var(--border)] pt-3">
              <div className="flex items-center justify-between">
                <span className="erp-text-body font-black">Total</span>
                <span className="font-mono text-xl font-black">{formatCurrency(quoteTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isQuickQuoteMessageEditing && canComposeQuickQuote ? (
        <div
          className="grid gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4"
          id="quick-quote-whatsapp-editor"
        >
          <Field
            description="Podes ajustar el texto antes de abrir WhatsApp. Los importes y productos no cambian en el presupuesto formal."
            htmlFor="quick-quote-whatsapp-message"
            label="Mensaje de WhatsApp"
          >
            <Textarea
              id="quick-quote-whatsapp-message"
              rows={9}
              value={quickQuoteText}
              onChange={(event) =>
                setQuickQuoteMessageOverride({
                  source: generatedQuickQuoteText,
                  text: event.target.value,
                })
              }
            />
          </Field>
          <div className="flex justify-end">
            <Button
              disabled={quickQuoteMessageOverride === null}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => setQuickQuoteMessageOverride(null)}
            >
              Restablecer mensaje automatico
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
        {isEdit ? (
          <>
            <ButtonLink href="/quotes" variant="secondary">Cancelar</ButtonLink>
            <Button disabled={!customerReady || calculatedLines.length === 0} type="submit">
              Guardar cambios
            </Button>
          </>
        ) : (
          <>
            <Button
              aria-controls="quick-quote-whatsapp-editor"
              aria-expanded={isQuickQuoteMessageEditing}
              disabled={!canComposeQuickQuote}
              type="button"
              variant="secondary"
              onClick={() => setIsQuickQuoteMessageEditing((current) => !current)}
            >
              {isQuickQuoteMessageEditing ? "Ocultar mensaje" : "Editar mensaje"}
            </Button>
            {canSendQuickQuote ? (
              <ButtonLink href={quickQuoteHref} prefetch={false} rel="noreferrer" target="_blank" variant="outline">
                WhatsApp rapido
              </ButtonLink>
            ) : (
              <Button disabled type="button" variant="outline">WhatsApp rapido</Button>
            )}
            <Button disabled={!customerReady || calculatedLines.length === 0} type="submit">
              Crear presupuesto formal
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
