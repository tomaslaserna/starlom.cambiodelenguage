"use client";

import { useMemo, useState } from "react";
import { Button, Card, CardContent, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow, Field, Input, SearchableSelect } from "@/components/ui";
import { formatCurrency, formatNumber } from "@/lib/format";
import { priceForList } from "@/lib/order-pricing";
import type { OrderFormProduct } from "@/lib/orders";
import type { SalesAdjustmentReference } from "@/lib/sales-documents";

type AdjustmentLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export function SalesAdjustmentFields({
  className,
  products,
  references,
  initialSaleId = "",
}: {
  className: "NC" | "ND";
  products: OrderFormProduct[];
  references: SalesAdjustmentReference[];
  initialSaleId?: string;
}) {
  const [saleId, setSaleId] = useState(() => references.some((sale) => sale.id === initialSaleId) ? initialSaleId : "");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lines, setLines] = useState<AdjustmentLine[]>([]);
  const [reason, setReason] = useState("");
  const selectedSale = references.find((sale) => sale.id === saleId) ?? null;
  const isCredit = className === "NC";

  const saleOptions = useMemo(() => references.map((sale) => ({
    value: sale.id,
    label: sale.label,
    description: `${formatCurrency(sale.amount)}${sale.fiscalApproved ? " · Factura emitida" : " · Remito"}`,
    searchText: sale.customerName,
  })), [references]);

  const selectableProducts = useMemo(() => {
    if (!selectedSale) return [];
    if (isCredit) {
      return selectedSale.items
        .filter((item) => item.quantity - item.returnedQuantity > 0)
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: item.unitPrice,
          available: item.quantity - item.returnedQuantity,
        }));
    }
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      price: priceForList(product.prices, selectedSale.priceList),
      available: product.available,
    })).filter((product) => product.price > 0);
  }, [isCredit, products, selectedSale]);

  const productOptions = selectableProducts.map((product) => ({
    value: product.id,
    label: product.name,
    description: `${isCredit ? "Pendiente de devolver" : "Stock disponible"}: ${formatNumber(product.available)} · ${formatCurrency(product.price)}`,
  }));
  const selectedProduct = selectableProducts.find((product) => product.id === productId) ?? null;
  const requestedQuantity = Math.max(0, Math.trunc(Number(quantity) || 0));
  const totalNet = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const vatRate = selectedSale?.vatRate ?? 0;
  const total = totalNet * (1 + vatRate / 100);
  const payload = lines.map((line) => ({ ...line, subtotal: Number((line.quantity * line.unitPrice).toFixed(2)) }));

  function addLine() {
    if (!selectedProduct || requestedQuantity <= 0) return;
    if (isCredit && requestedQuantity > selectedProduct.available) return;
    setLines((current) => [
      ...current.filter((line) => line.id !== selectedProduct.id),
      { id: selectedProduct.id, name: selectedProduct.name, quantity: requestedQuantity, unitPrice: selectedProduct.price },
    ]);
    setProductId("");
    setQuantity("1");
  }

  return (
    <div className="grid gap-4">
      <input name="className" type="hidden" value={className} />
      <input name="saleId" type="hidden" value={saleId} />
      <input name="detail" type="hidden" value={JSON.stringify(payload)} />
      <input name="reason" type="hidden" value={reason} />

      <Field htmlFor="adjustment-sale" label="Venta/remito entregado vinculado" required>
        <SearchableSelect
          id="adjustment-sale"
          options={saleOptions}
          placeholder="Buscar venta por numero o cliente"
          required
          value={saleId}
          onChange={(value) => {
            setSaleId(value);
            setProductId("");
            setLines([]);
          }}
        />
      </Field>

      {selectedSale ? (
        <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4 md:grid-cols-3">
          <div><div className="erp-text-caption text-[color:var(--muted)]">Cliente</div><div className="font-bold">{selectedSale.customerName}</div></div>
          <div><div className="erp-text-caption text-[color:var(--muted)]">Venta original</div><div className="font-bold">{formatCurrency(selectedSale.amount)}</div></div>
          <div><div className="erp-text-caption text-[color:var(--muted)]">Comprobante</div><div className="font-bold">{selectedSale.fiscalApproved ? "Factura emitida" : "Remito"}</div></div>
        </div>
      ) : null}

      <Card className="overflow-visible shadow-none">
        <CardContent className="grid gap-4 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_120px_auto] md:items-end">
            <Field htmlFor="adjustment-product" label={isCredit ? "Producto devuelto" : "Producto agregado"}>
              <SearchableSelect id="adjustment-product" options={productOptions} placeholder="Seleccionar producto" value={productId} onChange={setProductId} />
            </Field>
            <Field htmlFor="adjustment-quantity" label="Cantidad">
              <Input id="adjustment-quantity" min="1" step="1" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </Field>
            <Button disabled={!selectedProduct || requestedQuantity <= 0 || (isCredit && requestedQuantity > selectedProduct.available)} type="button" onClick={addLine}>Agregar</Button>
          </div>

          <DataTable caption="Detalle del ajuste" minWidth="620px" tableLabel="Detalle del ajuste">
            <DataTableHeader><DataTableRow><DataTableHead>Producto</DataTableHead><DataTableHead align="right">Cantidad</DataTableHead><DataTableHead align="right">Unitario neto</DataTableHead><DataTableHead align="right">Subtotal</DataTableHead><DataTableHead align="right">Accion</DataTableHead></DataTableRow></DataTableHeader>
            <DataTableBody>
              {lines.length ? lines.map((line) => (
                <DataTableRow key={line.id}>
                  <DataTableCell>{line.name}</DataTableCell><DataTableCell align="right">{line.quantity}</DataTableCell><DataTableCell align="right">{formatCurrency(line.unitPrice)}</DataTableCell><DataTableCell align="right">{formatCurrency(line.quantity * line.unitPrice)}</DataTableCell>
                  <DataTableCell align="right"><Button size="sm" type="button" variant="secondary" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>Quitar</Button></DataTableCell>
                </DataTableRow>
              )) : <DataTableRow><DataTableCell className="py-6 text-center text-[color:var(--muted)]" colSpan={5}>Sin productos</DataTableCell></DataTableRow>}
            </DataTableBody>
          </DataTable>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <Field htmlFor="adjustment-reason" label="Motivo" required>
          <Input id="adjustment-reason" minLength={5} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isCredit ? "Ej.: mercaderia devuelta" : "Ej.: agregado posterior a la entrega"} />
        </Field>
        <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
          <div className="flex justify-between"><span>Neto</span><b>{formatCurrency(totalNet)}</b></div>
          <div className="flex justify-between"><span>IVA {String(vatRate).replace(".", ",")}%</span><b>{formatCurrency(total - totalNet)}</b></div>
          <div className="mt-2 flex justify-between border-t pt-2"><strong>Total ajuste</strong><strong>{formatCurrency(total)}</strong></div>
        </div>
      </div>

      <Button disabled={!saleId || !lines.length || reason.trim().length < 5} type="submit">
        Registrar {isCredit ? "nota de credito" : "nota de debito"}
      </Button>
    </div>
  );
}
