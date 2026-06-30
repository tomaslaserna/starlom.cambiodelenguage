import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import {
  Button,
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
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  Toolbar,
} from "@/components/ui";
import { createSalesNoteAction } from "@/app/billing/actions";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { getFiscalStatus } from "@/lib/fiscal";
import { orderStatusLabel } from "@/lib/order-status";
import { getSalesSummary, listSalesLedger } from "@/lib/sales-admin";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { SALES_READ_PERMISSION } from "@/lib/route-auth";

type BillingPageProps = {
  searchParams: Promise<{
    page?: string;
    nro_id?: string;
    nro_factura?: string;
    tipo_factura?: string;
    cobro?: string;
    seguimiento?: string;
    mes?: string;
    anio?: string;
    created?: string;
  }>;
};

function paramsToUrlSearchParams(params: Awaited<BillingPageProps["searchParams"]>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search;
}

function trackingTone(value: string) {
  if (value === "facturada") return "success";
  return "warning";
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [SALES_READ_PERMISSION]);
  const params = await searchParams;
  const search = paramsToUrlSearchParams(params);
  const [ledger, summary] = await Promise.all([
    listSalesLedger(session.companyId, search),
    getSalesSummary(session.companyId, "todos"),
  ]);
  const fiscal = getFiscalStatus();

  return (
    <ModulePage
      active="billing"
      description="Facturacion, remitos, seguimiento fiscal y notas internas desde React."
      session={session}
      title="Facturacion"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Facturacion"
          description="Ledger de comprobantes, remitos y notas internas dentro de React."
          actions={
            <ButtonLink href="/orders/new" size="sm">
              Cargar pedido
            </ButtonLink>
          }
        />

        <Toolbar ariaLabel="Filtros de facturacion">
          <form
            action="/billing"
            className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_160px_160px_auto]"
          >
            <Field htmlFor="billing-tax-id" label="CUIT/DNI">
              <Input id="billing-tax-id" name="nro_id" defaultValue={params.nro_id ?? ""} />
            </Field>
            <Field htmlFor="billing-receipt" label="Comprobante">
              <Input id="billing-receipt" name="nro_factura" defaultValue={params.nro_factura ?? ""} />
            </Field>
            <Field htmlFor="billing-type" label="Tipo">
              <Select id="billing-type" name="tipo_factura" defaultValue={params.tipo_factura ?? ""}>
                <option value="">Todos</option>
                <option value="a">Factura A</option>
                <option value="b">Factura B</option>
                <option value="c">Factura C</option>
                <option value="remito">Remito</option>
                <option value="nc">Nota credito</option>
                <option value="nd">Nota debito</option>
              </Select>
            </Field>
            <Field htmlFor="billing-tracking" label="Seguimiento">
              <Select id="billing-tracking" name="seguimiento" defaultValue={params.seguimiento ?? ""}>
                <option value="">Todos</option>
                <option value="facturada">Facturada</option>
                <option value="no_facturada">No facturada</option>
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit">Filtrar</Button>
              <ButtonLink href="/billing" variant="secondary">
                Limpiar
              </ButtonLink>
            </div>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Comprobantes" value={formatNumber(summary.totalInvoices)} />
          <StatCard label="Monto total" value={formatCurrency(summary.totalAmount)} />
          <StatCard label="Facturado" value={formatCurrency(summary.invoiced)} tone="success" />
          <StatCard label="Sin factura" value={formatCurrency(summary.notInvoiced)} tone="warning" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Estado fiscal</CardTitle>
            <CardDescription>{fiscal.message}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <StatCard label="Proveedor" value={fiscal.provider.toUpperCase()} />
            <StatCard label="Modo" value={fiscal.mode} />
            <StatCard
              label="Estado"
              value={fiscal.ready ? "Listo" : fiscal.enabled ? "Pendiente" : "Deshabilitado"}
              tone={fiscal.ready ? "success" : "warning"}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <DataTable
            caption="Ledger de ventas, facturas y remitos"
            className="rounded-none border-0 shadow-none"
            minWidth="1120px"
            tableLabel="Comprobantes"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Comprobante</DataTableHead>
                <DataTableHead>Cliente</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead align="right">Monto</DataTableHead>
                <DataTableHead>Pedido</DataTableHead>
                <DataTableHead>Seguimiento</DataTableHead>
                <DataTableHead>Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {ledger.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState
                      title="No hay comprobantes para estos filtros"
                      description="Ajusta los filtros o revisa ventas entregadas y remitos pendientes."
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                ledger.data.map((item) => (
                  <DataTableRow key={`${item.saleId ?? "r"}-${item.deliveryId ?? "d"}`}>
                    <DataTableCell>
                      <div className="font-medium">{item.type}</div>
                      <div className="mt-1 font-mono text-xs text-[color:var(--muted)]">
                        {item.receiptNumber ?? item.deliveryNumber ?? "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="max-w-[260px] break-words font-medium">{item.customerName || "-"}</div>
                      <div className="mt-1 font-mono text-xs text-[color:var(--muted)]">{item.customerDocument || "-"}</div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{formatDate(item.date)}</DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatCurrency(item.amount)}
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={item.orderStatus === "entregado" ? "success" : "warning"}>
                        {orderStatusLabel(item.orderStatus)}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={trackingTone(item.trackingStatus)}>{item.trackingStatus}</StatusBadge>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex flex-wrap gap-2">
                        {item.deliveryId ? (
                          <ButtonLink
                            href={`/api/pdfs/deliveries/${item.deliveryId}?prices=1`}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="secondary"
                          >
                            Remito PDF
                          </ButtonLink>
                        ) : null}
                        <ButtonLink
                          href={`/billing?saleId=${item.saleId ?? ""}&remittanceId=${item.deliveryId ?? ""}`}
                          size="sm"
                          variant="outline"
                        >
                          Nota interna
                        </ButtonLink>
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/billing"
            page={ledger.meta.page}
            query=""
            totalPages={ledger.meta.totalPages}
            extraParams={{
              nro_id: params.nro_id,
              nro_factura: params.nro_factura,
              tipo_factura: params.tipo_factura,
              cobro: params.cobro,
              seguimiento: params.seguimiento,
              mes: params.mes,
              anio: params.anio,
            }}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Crear nota interna</CardTitle>
            <CardDescription>
              Flujo React de notas no fiscales. ARCA/CAE queda reservado para la etapa fiscal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createSalesNoteAction} className="grid gap-4 lg:grid-cols-2">
              <Field htmlFor="note-sale-id" label="ID venta">
                <Input id="note-sale-id" name="saleId" defaultValue={params["saleId" as keyof typeof params] ?? ""} />
              </Field>
              <Field htmlFor="note-remittance-id" label="ID remito">
                <Input
                  id="note-remittance-id"
                  name="remittanceId"
                  defaultValue={params["remittanceId" as keyof typeof params] ?? ""}
                />
              </Field>
              <Field htmlFor="note-class" label="Clase">
                <Select id="note-class" name="className" defaultValue="NC">
                  <option value="NC">Nota de credito</option>
                  <option value="ND">Nota de debito</option>
                </Select>
              </Field>
              <Field htmlFor="note-reason" label="Motivo">
                <Input id="note-reason" name="reason" placeholder="Ajuste interno" />
              </Field>
              <Field
                className="lg:col-span-2"
                htmlFor="note-detail"
                label="Detalle JSON"
                description='Formato: [{"id":123,"name":"Producto","quantity":1,"unitPrice":1000}]'
              >
                <Textarea id="note-detail" name="detail" rows={5} />
              </Field>
              <input name="fiscal" type="hidden" value="0" />
              <div className="lg:col-span-2">
                <Button type="submit">Crear nota interna</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
