import { ModulePage } from "@/components/module-page";
import {
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
  StatCard,
  StatusBadge,
  TableHoverActionMenu,
  Toolbar,
} from "@/components/ui";
import { listSalesToCollect } from "@/lib/collections";
import { buildCollectionOrderMessage } from "@/lib/collection-order";
import { formatCurrency, formatDate } from "@/lib/format";
import { normalizePhoneForWhatsapp } from "@/lib/order-confirmation";
import { desiredDocumentLabel } from "@/lib/receipt-types";
import { localDateIso } from "@/lib/timezone";
import { requireStaffSession } from "@/lib/auth";
import {
  COLLECTIONS_CREATE_PERMISSION,
  sessionAllows,
  sessionCanReadCollections,
} from "@/lib/route-auth";
import { redirect } from "next/navigation";
import { registerCollectionAction } from "@/app/collections/actions";
import { RegisterCollectionDialog } from "@/app/collections/register-collection-dialog";

type CollectionsPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

type SaleToCollect = Awaited<ReturnType<typeof listSalesToCollect>>[number];

function matchesQuery(item: SaleToCollect, query: string) {
  if (!query) return true;
  const haystack = [item.customerName, item.customerTaxId, String(item.receiptNumber)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function awaitingApproval(item: SaleToCollect) {
  return item.collectionStatus === "pendiente_aprobacion" || item.collectionStatus === "en_proceso";
}

const actionItemClass =
  "flex h-[var(--control-height-sm)] min-h-[var(--control-height-sm)] w-full items-center rounded-[6px] px-2.5 text-left text-xs font-semibold text-[#0f172a] transition-colors hover:bg-[color:var(--panel-subtle)] hover:text-[color:var(--accent-strong)]";

function collectionOrderHref(item: SaleToCollect) {
  const phone = normalizePhoneForWhatsapp(item.phone);
  if (!phone) return null;
  const message = buildCollectionOrderMessage({
    customerName: item.customerName,
    documentLabel: desiredDocumentLabel(item.desiredDocument),
    receiptNumber: item.receiptNumber,
    amountLabel: formatCurrency(item.outstandingAmount),
    dueDateLabel: formatDate(item.dueDate),
    overdueDays: item.overdueDays,
  });
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default async function CollectionsPage({ searchParams }: CollectionsPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadCollections(session))) redirect("/");

  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const [allSales, canRegister] = await Promise.all([
    listSalesToCollect(session.companyId),
    sessionAllows(session, [COLLECTIONS_CREATE_PERMISSION]),
  ]);
  const sales = allSales.filter((item) => matchesQuery(item, query));
  const totalOutstanding = sales.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const overdueSales = sales.filter((item) => item.overdue);
  const overdueAmount = overdueSales.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const today = localDateIso();

  return (
    <ModulePage
      active="collections"
      description="Ventas entregadas con saldo pendiente de cobro."
      session={session}
      title="Cobros"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Registra el cobro de cada venta entregada. La aprobacion se resuelve en Solicitudes y aprobaciones."
          title="Ventas a cobrar"
        />

        <Toolbar ariaLabel="Busqueda de ventas a cobrar">
          <form
            action="/collections"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
          >
            <Field htmlFor="collections-query" label="Buscar">
              <Input
                defaultValue={params.q ?? ""}
                id="collections-query"
                name="q"
                placeholder="Cliente, CUIT o nro de comprobante"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            className="p-3"
            detail="Calculado sobre las ventas visibles"
            label="Saldo total a cobrar"
            value={formatCurrency(totalOutstanding)}
          />
          <StatCard
            className="p-3"
            detail={`${overdueSales.length} ventas vencidas`}
            label="Monto vencido"
            value={formatCurrency(overdueAmount)}
          />
          <StatCard
            className="p-3"
            detail="Con la busqueda actual"
            label="Ventas visibles"
            value={sales.length}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Ventas entregadas con saldo pendiente"
            className="rounded-none border-0 shadow-none"
            minWidth="1120px"
            tableLabel="Ventas a cobrar"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[9%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[11%] px-2">Comprobante</DataTableHead>
                <DataTableHead className="w-[20%] px-2">Nombre</DataTableHead>
                <DataTableHead className="w-[12%] px-2">CUIT</DataTableHead>
                <DataTableHead align="right" className="w-[12%] px-2">Monto a cobrar</DataTableHead>
                <DataTableHead className="w-[12%] px-2">Vencimiento</DataTableHead>
                <DataTableHead className="w-[10%] px-2">Documento</DataTableHead>
                <DataTableHead align="center" className="w-[10%] px-2">Opciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {sales.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={8}>
                    <EmptyState
                      description="No hay ventas entregadas con saldo pendiente para la busqueda actual."
                      title="Sin ventas a cobrar"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                sales.map((item) => {
                  const pdfHref = item.hasFiscalPdf
                    ? `/api/pdfs/fiscal/sales/${item.id}`
                    : item.deliveryDocumentId
                      ? `/api/pdfs/deliveries/${item.deliveryDocumentId}`
                      : `/api/pdfs/orders/${item.id}/request`;
                  const orderHref = collectionOrderHref(item);
                  const receiptLabel = `${desiredDocumentLabel(item.desiredDocument)} #${String(item.receiptNumber).padStart(4, "0")}`;
                  const showRegister = canRegister && !awaitingApproval(item);

                  return (
                    <DataTableRow
                      key={item.id}
                      className={item.overdue ? "bg-[color:var(--danger-subtle)] hover:bg-[color:var(--danger-subtle)]" : undefined}
                    >
                      <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">
                        {formatDate(item.date)}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <span className="font-mono text-xs font-black">
                          #{String(item.receiptNumber).padStart(4, "0")}
                        </span>
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 font-medium">
                        {item.customerName || "Sin cliente"}
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 font-mono text-xs">
                        {item.customerTaxId || "-"}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                        {formatCurrency(item.outstandingAmount)}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className={`whitespace-nowrap text-xs ${item.overdue ? "font-black text-[color:var(--danger)]" : ""}`}>
                          {formatDate(item.dueDate)}
                        </div>
                        {item.overdue ? (
                          <StatusBadge className="mt-1" tone="danger">
                            Vencida
                          </StatusBadge>
                        ) : null}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="grid justify-items-start gap-1.5">
                          <span className="truncate text-xs">{desiredDocumentLabel(item.desiredDocument)}</span>
                          <ButtonLink
                            aria-label={`Descargar PDF de ${receiptLabel}`}
                            className="shrink-0"
                            href={pdfHref}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="secondary"
                          >
                            PDF
                          </ButtonLink>
                        </div>
                      </DataTableCell>
                      <DataTableCell align="center" className="px-2 py-2">
                        {awaitingApproval(item) ? (
                          <div className="min-w-0">
                            <StatusBadge tone="warning">En aprobacion</StatusBadge>
                            <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                              {formatCurrency(item.registeredAmount)} registrado
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-center">
                          <TableHoverActionMenu label={`Opciones de cobranza de ${receiptLabel}`} width={270}>
                            <div className="grid gap-0.5">
                              {showRegister ? (
                                <RegisterCollectionDialog
                                  action={registerCollectionAction}
                                  customerName={item.customerName}
                                  outstandingAmount={item.outstandingAmount}
                                  receiptLabel={receiptLabel}
                                  saleId={item.id}
                                  today={today}
                                  triggerClassName={actionItemClass}
                                />
                              ) : (
                                <span className="block px-2.5 py-1.5 text-xs text-[color:var(--muted)]">Sin permiso para registrar</span>
                              )}
                              {orderHref ? (
                                <a
                                  aria-label={`Emitir orden de cobro por WhatsApp para ${receiptLabel}`}
                                  className={actionItemClass}
                                  href={orderHref}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Emitir orden de cobro
                                </a>
                              ) : (
                                <span className="block px-2.5 py-1.5 text-xs text-[color:var(--muted)]">Sin telefono</span>
                              )}
                            </div>
                          </TableHoverActionMenu>
                          </div>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
