import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/module-page";
import {
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/lib/page-auth";
import { SALES_READ_PERMISSION } from "@/lib/route-auth";
import { formatSaleCommercialCode } from "@/lib/sale-commercial-code";
import { getSaleDetail360 } from "@/lib/sale-detail";

type SaleDetailPageProps = { params: Promise<{ id: string }> };

function detailLine(label: string, value: ReactNode) {
  return (
    <div className="grid grid-cols-[minmax(8.5rem,0.85fr)_1.15fr] gap-3 border-b border-[color:var(--border)]/60 py-2.5 last:border-b-0">
      <span className="erp-text-caption text-[color:var(--muted)]">{label}</span>
      <span className="erp-text-body-sm text-right font-semibold">{value || "-"}</span>
    </div>
  );
}

function elapsedTime(startValue: string, endValue: string | null) {
  if (!startValue || !endValue) return "Sin entrega registrada";
  const milliseconds = new Date(endValue).getTime() - new Date(startValue).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "No disponible";
  const totalMinutes = Math.round(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days} d` : "", hours ? `${hours} h` : "", minutes || (!days && !hours) ? `${minutes} min` : ""]
    .filter(Boolean)
    .join(" ");
}

function statusTone(status: string): StatusBadgeTone {
  if (status === "entregado" || status === "cancelado") return status === "entregado" ? "success" : "danger";
  if (status === "confirmado") return "info";
  return "warning";
}

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [SALES_READ_PERMISSION]);
  const { id } = await params;
  const sale = await getSaleDetail360(session.companyId, id).catch(() => null);
  if (!sale) notFound();

  const saleCode = formatSaleCommercialCode({
    commercialNumber: sale.commercialNumber,
    saleNumber: sale.saleNumber,
    deliveryNumber: sale.deliveryNumber,
    legacyRemittanceNumber: sale.receiptNumber,
  });
  const address = [sale.customerAddress, sale.customerLocality, sale.customerProvince].filter(Boolean).join(" · ");
  const deliveryTime = elapsedTime(sale.registeredAt, sale.deliveredAt);

  return (
    <ModulePage active="sales" description="Trazabilidad comercial y operativa de la venta." session={session} title={`Venta #${saleCode}`}>
      <div className="grid gap-5">
        <Card className="overflow-hidden border-[color:var(--accent)]/30 bg-[linear-gradient(135deg,#ffffff_0%,#f4f8ff_100%)]">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusBadge tone={statusTone(sale.orderStatus)}>{sale.orderStatus || "sin estado"}</StatusBadge>
                <span className="font-mono text-xs font-black text-[color:var(--muted)]">#{saleCode}</span>
              </div>
              <PageHeader
                description={`${sale.customerDocument || "Sin CUIT/DNI"} · ${formatDate(sale.date)}`}
                title={sale.customerName || "Venta sin cliente"}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link className="erp-text-body-sm font-bold text-[color:var(--accent)] hover:underline" href="/sales">← Volver a ventas</Link>
              {sale.deliveryNumber ? <ButtonLink href={`/api/pdfs/orders/${sale.id}/remito`} target="_blank" variant="secondary">Ver remito</ButtonLink> : null}
              {sale.fiscalStatus === "aprobado" ? <ButtonLink href={`/api/pdfs/orders/${sale.id}/document`} target="_blank">Ver factura</ButtonLink> : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Venta neta de ajustes" value={formatCurrency(sale.adjustedAmount)} />
          <StatCard label="Costo histórico" value={formatCurrency(sale.totalCost)} />
          <StatCard detail="Venta neta sin IVA menos costo" label="Ganancia bruta" tone={sale.grossProfit >= 0 ? "success" : "danger"} value={formatCurrency(sale.grossProfit)} />
          <StatCard label="Margen bruto" tone={sale.grossMarginPercent >= 0 ? "info" : "danger"} value={`${sale.grossMarginPercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`} />
          <StatCard detail={sale.deliveredAt ? `Entregado ${formatDateTime(sale.deliveredAt)}` : undefined} label="Tiempo hasta entrega" tone="accent" value={deliveryTime} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Responsables</CardTitle><CardDescription>Quién cargó, vendió y cerró la operación.</CardDescription></CardHeader>
            <CardContent className="pt-2">
              {detailLine("Operador que registró", sale.operatorName)}
              {detailLine("Vendedor del cliente", sale.seller || "No asignado")}
              {detailLine("Operador de entrega", sale.deliveryOperatorName)}
              {detailLine("Prioridad", sale.priority)}
            </CardContent>
          </Card>
          <Card className="overflow-hidden xl:col-span-2">
            <CardHeader><CardTitle>Datos del cliente</CardTitle><CardDescription>Identificación, contacto y destino de la mercadería.</CardDescription></CardHeader>
            <CardContent className="grid gap-x-6 pt-2 md:grid-cols-2">
              <div>
                {detailLine("Cliente", sale.customerName)}
                {detailLine("Razón social", sale.customerLegalName)}
                {detailLine("CUIT/DNI", sale.customerDocument)}
                {detailLine("Condición IVA", sale.customerFiscalCondition)}
              </div>
              <div>
                {detailLine("Teléfono", sale.customerPhone)}
                {detailLine("Correo", sale.customerEmail)}
                {detailLine("Dirección", address)}
                {detailLine("Entrega", sale.customerDeliveryAddress || sale.customerAddress)}
                {detailLine("Horario", sale.customerOpeningHours)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Cronología del pedido</CardTitle><CardDescription>Del registro inicial a la entrega efectiva.</CardDescription></CardHeader>
          <CardContent>
            <ol className="grid gap-3 md:grid-cols-3">
              {[
                ["1", "Pedido registrado", sale.registeredAt, sale.operatorName],
                ["2", "Pedido confirmado", sale.confirmedAt, sale.confirmedAt ? "Stock validado" : "Sin marca horaria"],
                ["3", "Pedido entregado", sale.deliveredAt, sale.deliveredAt ? deliveryTime : "Pendiente"],
              ].map(([step, title, date, note]) => (
                <li className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] p-4" key={step}>
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent)] font-black text-white">{step}</div>
                  <div className="font-black">{title}</div>
                  <div className="mt-1 text-sm font-semibold">{date ? formatDateTime(date) : "No registrado"}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">{note}</div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Productos y rentabilidad</CardTitle><CardDescription>Los costos son los congelados al registrar la operación.</CardDescription></CardHeader>
          <DataTable caption="Productos incluidos en la venta" minWidth="920px" tableLabel="Detalle de productos">
            <DataTableHeader><DataTableRow className="hover:bg-transparent">
              <DataTableHead>Producto</DataTableHead><DataTableHead>Cantidad</DataTableHead><DataTableHead>Precio unitario</DataTableHead><DataTableHead>Descuento</DataTableHead><DataTableHead>Subtotal neto</DataTableHead><DataTableHead>Costo</DataTableHead><DataTableHead>Ganancia</DataTableHead>
            </DataTableRow></DataTableHeader>
            <DataTableBody>
              {sale.lines.map((line) => {
                const cost = line.unitCost * line.quantity;
                const profit = line.subtotal - cost;
                return <DataTableRow key={line.id}>
                  <DataTableCell className="font-semibold">{line.name}</DataTableCell>
                  <DataTableCell>{line.quantity.toLocaleString("es-AR")}</DataTableCell>
                  <DataTableCell>{formatCurrency(line.unitPrice)}</DataTableCell>
                  <DataTableCell>{line.discount ? `${line.discount.toLocaleString("es-AR")}%` : "-"}</DataTableCell>
                  <DataTableCell className="font-semibold">{formatCurrency(line.subtotal)}</DataTableCell>
                  <DataTableCell>{formatCurrency(cost)}</DataTableCell>
                  <DataTableCell className={profit < 0 ? "font-black text-[color:var(--danger)]" : "font-black text-[color:var(--success)]"}>{formatCurrency(profit)}</DataTableCell>
                </DataTableRow>;
              })}
            </DataTableBody>
          </DataTable>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Condiciones comerciales</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {detailLine("Lista aplicada", sale.priceList)}
              {detailLine("Condición de pago", sale.paymentCondition)}
              {detailLine("Plazo pactado", sale.paymentTermDays === null ? "No registrado" : `${sale.paymentTermDays} días`)}
              {detailLine("Cobrado", formatCurrency(sale.collectedAmount))}
              {detailLine("Saldo pendiente", formatCurrency(sale.outstandingAmount))}
              {detailLine("Estado de cobro", sale.collectionStatus)}
              {detailLine("Método registrado", sale.collectionMethod)}
              {detailLine("Pago registrado", sale.collectionRegisteredAt ? formatDateTime(sale.collectionRegisteredAt) : "No registrado")}
              {detailLine("Operación de pago", sale.collectionOperation)}
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Documentación y control</CardTitle></CardHeader>
            <CardContent className="pt-2">
              {detailLine("Comprobante solicitado", sale.desiredDocument || "Remito")}
              {detailLine("Remito", sale.deliveryNumber ? `#${String(sale.deliveryNumber).padStart(4, "0")}` : "No emitido")}
              {detailLine("Estado fiscal", sale.fiscalStatus)}
              {detailLine("Notas de crédito", sale.creditNoteAmount ? `-${formatCurrency(sale.creditNoteAmount)}` : "Sin ajustes")}
              {detailLine("Notas de débito", sale.debitNoteAmount ? `+${formatCurrency(sale.debitNoteAmount)}` : "Sin ajustes")}
              {detailLine("Factura", sale.fiscalReceiptNumber ? `${String(sale.fiscalPointOfSale ?? 0).padStart(4, "0")}-${String(sale.fiscalReceiptNumber).padStart(8, "0")}` : "No emitida")}
              {detailLine("Autorización fiscal", sale.invoiceAuthorizedAt ? formatDateTime(sale.invoiceAuthorizedAt) : "No registrada")}
              {detailLine("Stock descontado", sale.stockDiscounted ? "Sí" : "No")}
              {detailLine("Ítems", sale.itemCount.toLocaleString("es-AR"))}
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Observaciones</CardTitle><CardDescription>Indicaciones operativas que acompañan al pedido y al remito.</CardDescription></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--foreground)]">{sale.observation || "Sin observaciones registradas."}</p></CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
