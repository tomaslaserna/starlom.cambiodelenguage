import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import {
  AppIcon,
  Button,
  ButtonLink,
  Card,
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
  SearchInput,
  Select,
  StatCard,
  StatusBadge,
  TableActionMenu,
  Toolbar,
  tableActionItemClass,
  type StatusBadgeTone,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { getFiscalVatSummary } from "@/lib/fiscal-ledger";
import { fiscalStatusLabel } from "@/lib/fiscal";
import { orderStatusLabel } from "@/lib/order-status";
import { listSalesLedger } from "@/lib/sales-admin";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { SALES_READ_PERMISSION } from "@/lib/route-auth";
import { authorizeFiscalInvoiceAction, rejectFiscalInvoiceAction } from "@/app/billing/actions";

type BillingPageProps = {
  searchParams: Promise<{
    page?: string;
    cliente?: string;
    nro_id?: string;
    nro_factura?: string;
    tipo_factura?: string;
    cobro?: string;
    seguimiento?: string;
    estado_fiscal?: string;
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
  const [ledger, vatSummary] = await Promise.all([
    listSalesLedger(session.companyId, search),
    getFiscalVatSummary(session.companyId),
  ]);

  return (
    <ModulePage
      active="billing"
      description="Registro fiscal, autorizaciones ARCA, rechazos, notas y consultas historicas."
      session={session}
      title="Fiscal"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Fiscal"
          description="Documentos fiscales aprobados, pendientes y rechazados. Las autorizaciones se resuelven desde esta pantalla."
          moduleIntro
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            detail={`Periodo ${vatSummary.period} - ventas ARCA`}
            icon={<AppIcon className="h-6 w-6" name="chart" />}
            label="IVA ventas"
            tone="accent"
            value={formatCurrency(vatSummary.salesVatDebit + vatSummary.debitNotesVat - vatSummary.creditNotesVat)}
          />
          <StatCard
            detail="Compras cargadas con IVA en el periodo"
            icon={<AppIcon className="h-6 w-6" name="cart" />}
            label="IVA compras"
            tone="accent"
            value={formatCurrency(vatSummary.purchaseVatCredit)}
          />
          <StatCard
            detail={vatSummary.netVatBalance >= 0 ? "Saldo tecnico a pagar" : "Credito fiscal neto"}
            icon={<AppIcon className="h-6 w-6" name="wallet" />}
            label="Saldo IVA"
            tone="accent"
            value={formatCurrency(vatSummary.netVatBalance)}
          />
          <StatCard
            detail={`Compras con IVA ${formatCurrency(vatSummary.purchaseWithVatTotal)}`}
            icon={<AppIcon className="h-6 w-6" name="invoice" />}
            label="Facturacion fiscal"
            tone="accent"
            value={formatCurrency(vatSummary.fiscalSalesTotal)}
          />
        </div>

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
        {params.arca === "rejected" ? (
          <div className="rounded-lg border border-[color:var(--warning)] bg-[color:var(--warning-subtle)] px-4 py-3 font-semibold text-[color:var(--warning)]">
            Documento fiscal rechazado y registrado.
          </div>
        ) : null}

        <Toolbar ariaLabel="Filtros de facturacion">
          <form
            action="/billing"
            className="grid w-full items-end gap-3 md:grid-cols-2 xl:grid-cols-6"
          >
            <Field className="min-w-0" htmlFor="billing-customer" label="Cliente">
              <SearchInput
                id="billing-customer"
                name="cliente"
                defaultValue={params.cliente ?? ""}
                placeholder="Nombre o razon social"
              />
            </Field>
            <Field className="min-w-0" htmlFor="billing-tax-id" label="CUIT/DNI">
              <Input id="billing-tax-id" name="nro_id" defaultValue={params.nro_id ?? ""} placeholder="CUIT/DNI" />
            </Field>
            <Field className="min-w-0" htmlFor="billing-receipt" label="Comprobante">
              <Input id="billing-receipt" name="nro_factura" defaultValue={params.nro_factura ?? ""} placeholder="N° comprobante" />
            </Field>
            <Field className="min-w-0" htmlFor="billing-type" label="Tipo">
              <Select id="billing-type" name="tipo_factura" defaultValue={params.tipo_factura ?? ""}>
                <option value="">Todos</option>
                <option value="a">Factura A</option>
                <option value="b">Factura B</option>
                <option value="c">Factura C</option>
                <option value="nc">Nota credito</option>
                <option value="nd">Nota debito</option>
              </Select>
            </Field>
            <Field className="min-w-0" htmlFor="billing-tracking" label="Seguimiento">
              <Select id="billing-tracking" name="seguimiento" defaultValue={params.seguimiento ?? ""}>
                <option value="">Todos</option>
                <option value="facturada">Facturada</option>
                <option value="no_facturada">No facturada</option>
              </Select>
            </Field>
            <Field className="min-w-0" htmlFor="billing-fiscal-status" label="Estado">
              <Select id="billing-fiscal-status" name="estado_fiscal" defaultValue={params.estado_fiscal ?? ""}>
                <option value="">Todos</option>
                <option value="no_enviado">No enviado</option>
                <option value="error">Error</option>
                <option value="rechazado">Rechazado</option>
                <option value="aprobado">Aprobado</option>
              </Select>
            </Field>
            <div className="flex flex-col gap-3 md:col-span-2 md:flex-row md:justify-end xl:col-span-6">
              <Button className="w-full md:w-[144px]" leadingIcon={<AppIcon name="filter" />} type="submit">
                Filtrar
              </Button>
              <ButtonLink
                className="w-full md:w-[144px]"
                href="/billing"
                leadingIcon={<AppIcon name="refresh" />}
                variant="outline"
              >
                Limpiar
              </ButtonLink>
            </div>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Ledger de facturas aprobadas"
            className="rounded-none border-0 shadow-none"
            minWidth="1080px"
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
                      <TableActionMenu>
                        {item.saleId && item.hasFiscalIdentity ? (
                          <a
                            className={tableActionItemClass}
                            href={`/api/pdfs/fiscal/sales/${item.saleId}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Factura PDF
                          </a>
                        ) : null}
                        {item.saleId && ["no_enviado", "error", "rechazado"].includes(item.fiscalStatus) ? (
                          <form action={authorizeFiscalInvoiceAction}>
                            <input name="saleId" type="hidden" value={item.saleId} />
                            <button className={tableActionItemClass} type="submit">
                              Autorizar ARCA
                            </button>
                          </form>
                        ) : null}
                        {item.saleId && ["no_enviado", "error"].includes(item.fiscalStatus) ? (
                          <form action={rejectFiscalInvoiceAction}>
                            <input name="saleId" type="hidden" value={item.saleId} />
                            <input name="reason" type="hidden" value="Rechazado desde Fiscal" />
                            <button
                              className={`${tableActionItemClass} text-[color:var(--danger)] hover:bg-[color:var(--danger-subtle)] hover:text-[color:var(--danger)]`}
                              type="submit"
                            >
                              Rechazar
                            </button>
                          </form>
                        ) : null}
                        {item.saleId && item.hasFiscalIdentity && !item.creditNoteCae ? (
                          <a className={tableActionItemClass} href={`/billing/credit-note/${item.saleId}`}>
                            Nota credito
                          </a>
                        ) : null}
                        {item.creditNoteId && item.creditNoteCae ? (
                          <a
                            className={tableActionItemClass}
                            href={`/api/pdfs/fiscal/notes/${item.creditNoteId}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            NC PDF
                          </a>
                        ) : null}
                        {item.saleId && item.hasFiscalIdentity && !item.debitNoteCae ? (
                          <a className={tableActionItemClass} href={`/billing/debit-note/${item.saleId}`}>
                            Nota debito
                          </a>
                        ) : null}
                        {item.debitNoteId && item.debitNoteCae ? (
                          <a
                            className={tableActionItemClass}
                            href={`/api/pdfs/fiscal/notes/${item.debitNoteId}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            ND PDF
                          </a>
                        ) : null}
                        {item.deliveryId ? (
                          <a
                            className={tableActionItemClass}
                            href={`/api/pdfs/deliveries/${item.deliveryId}?prices=1`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Remito PDF
                          </a>
                        ) : null}
                      </TableActionMenu>
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
              cliente: params.cliente,
              nro_id: params.nro_id,
              nro_factura: params.nro_factura,
              tipo_factura: params.tipo_factura,
              cobro: params.cobro,
              seguimiento: params.seguimiento,
              estado_fiscal: params.estado_fiscal,
              mes: params.mes,
              anio: params.anio,
            }}
          />
        </Card>

      </div>
    </ModulePage>
  );
}
