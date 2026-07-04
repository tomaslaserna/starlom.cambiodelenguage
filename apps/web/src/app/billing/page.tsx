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
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { fiscalStatusLabel, getFiscalStatus } from "@/lib/fiscal";
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
    arca?: string;
    message?: string;
  }>;
};

function paramsToUrlSearchParams(params: Awaited<BillingPageProps["searchParams"]>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search;
}

function fiscalTone(value: string): StatusBadgeTone {
  if (value === "aprobado") return "success";
  if (value === "pendiente") return "warning";
  if (value === "rechazado" || value === "error") return "danger";
  return "neutral";
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [SALES_READ_PERMISSION]);
  const params = await searchParams;
  const search = paramsToUrlSearchParams(params);
  search.set("estado_fiscal", "aprobado");
  const [ledger, summary] = await Promise.all([
    listSalesLedger(session.companyId, search),
    getSalesSummary(session.companyId, "todos"),
  ]);
  const fiscal = getFiscalStatus();

  return (
    <ModulePage
      active="billing"
      description="Registro de ventas facturadas y aprobadas fiscalmente."
      session={session}
      title="Registro de facturas"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Registro de facturas"
          description="Solo ventas con factura aprobada fiscalmente. Las pendientes se aprueban desde Solicitudes y aprobaciones."
          actions={
            <ButtonLink href="/admin/approvals" size="sm">
              Solicitudes y aprobaciones
            </ButtonLink>
          }
        />

        {params.arca === "approved" ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 font-semibold text-[color:var(--success)]">
            Factura aprobada fiscalmente. El comprobante quedo disponible en Registro de facturas.
          </div>
        ) : null}
        {params.arca === "error" ? (
          <div className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-subtle)] px-4 py-3 font-semibold text-[color:var(--danger)]">
            {params.message ?? "No se pudo autorizar la factura fiscal."}
          </div>
        ) : null}

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
            caption="Ledger de facturas aprobadas"
            className="rounded-none border-0 shadow-none"
            minWidth="0"
            tableLabel="Registro de facturas"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[14%] px-2">Comprobante</DataTableHead>
                <DataTableHead className="w-[23%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[9%] px-2">Fecha</DataTableHead>
                <DataTableHead align="right" className="w-[11%] px-2">Monto</DataTableHead>
                <DataTableHead className="w-[18%] px-2">Fiscal</DataTableHead>
                <DataTableHead className="w-[10%] px-2">Pedido</DataTableHead>
                <DataTableHead className="w-[15%] px-2">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {ledger.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState
                      title="No hay comprobantes para estos filtros"
                      description="Ajusta los filtros o revisa las facturas pendientes en Solicitudes y aprobaciones."
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                ledger.data.map((item) => (
                  <DataTableRow key={`${item.saleId ?? "r"}-${item.deliveryId ?? "d"}`}>
                    <DataTableCell className="px-2 py-2">
                      <div className="truncate font-medium">{item.type}</div>
                      <div className="mt-1 font-mono text-xs text-[color:var(--muted)]">
                        {item.receiptNumber ?? item.deliveryNumber ?? "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="px-2 py-2">
                      <div className="truncate font-medium">{item.customerName || "-"}</div>
                      <div className="mt-1 truncate font-mono text-xs text-[color:var(--muted)]">{item.customerDocument || "-"}</div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">{formatDate(item.date)}</DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                      {formatCurrency(item.amount)}
                    </DataTableCell>
                    <DataTableCell className="px-2 py-2">
                      <StatusBadge tone={fiscalTone(item.fiscalStatus)}>
                        {fiscalStatusLabel(item.fiscalStatus)}
                      </StatusBadge>
                      {item.fiscalErrorMessage ? (
                        <div className="mt-1 line-clamp-2 text-xs text-[color:var(--danger)]">
                          {item.fiscalErrorMessage}
                        </div>
                      ) : null}
                      {item.creditNoteCae ? (
                        <div className="mt-1 text-xs text-[color:var(--danger)]">
                          Nota credito emitida
                        </div>
                      ) : item.creditNoteStatus ? (
                        <div className="mt-1 text-xs text-[color:var(--danger)]">
                          NC {fiscalStatusLabel(item.creditNoteStatus)}
                        </div>
                      ) : null}
                      {item.debitNoteCae ? (
                        <div className="mt-1 text-xs text-[color:var(--danger)]">
                          Nota debito emitida
                        </div>
                      ) : item.debitNoteStatus ? (
                        <div className="mt-1 text-xs text-[color:var(--danger)]">
                          ND {fiscalStatusLabel(item.debitNoteStatus)}
                        </div>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell className="px-2 py-2">
                      <StatusBadge tone={item.orderStatus === "entregado" ? "success" : "warning"}>
                        {orderStatusLabel(item.orderStatus)}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        {item.saleId && item.hasFiscalIdentity ? (
                          <ButtonLink
                            href={`/api/pdfs/fiscal/sales/${item.saleId}`}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="secondary"
                          >
                            Factura PDF
                          </ButtonLink>
                        ) : null}
                        {item.saleId && item.hasFiscalIdentity && !item.creditNoteCae ? (
                          <ButtonLink
                            href={`/billing/credit-note/${item.saleId}`}
                            size="sm"
                            variant="danger"
                          >
                            Nota credito
                          </ButtonLink>
                        ) : null}
                        {item.creditNoteId && item.creditNoteCae ? (
                          <ButtonLink
                            href={`/api/pdfs/fiscal/notes/${item.creditNoteId}`}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="secondary"
                          >
                            NC PDF
                          </ButtonLink>
                        ) : null}
                        {item.saleId && item.hasFiscalIdentity && !item.debitNoteCae ? (
                          <ButtonLink
                            href={`/billing/debit-note/${item.saleId}`}
                            size="sm"
                            variant="outline"
                          >
                            Nota debito
                          </ButtonLink>
                        ) : null}
                        {item.debitNoteId && item.debitNoteCae ? (
                          <ButtonLink
                            href={`/api/pdfs/fiscal/notes/${item.debitNoteId}`}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="secondary"
                          >
                            ND PDF
                          </ButtonLink>
                        ) : null}
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

      </div>
    </ModulePage>
  );
}
