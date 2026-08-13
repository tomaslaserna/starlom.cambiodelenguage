import { ModulePage } from "@/components/module-page";
import { MetricIcon } from "@/components/metric-icon";
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
  Select,
  StatCard,
  StatusBadge,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { getOrderFormData } from "@/lib/orders";
import { hasFiscalCustomerData, listQuotes } from "@/lib/quotes";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import {
  QUOTES_APPROVE_PERMISSION,
  QUOTES_CREATE_PERMISSION,
  QUOTES_READ_PERMISSION,
  sessionAllows,
} from "@/lib/route-auth";
import { acceptQuoteAction, createQuoteAction, deleteQuoteAction } from "@/app/quotes/actions";
import { QuoteDeleteButton } from "@/app/quotes/quote-delete-button";
import { QuoteEntryFields } from "@/app/quotes/quote-entry-fields";
import { QuoteEntryForm } from "@/app/quotes/quote-entry-form";

type QuotesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    error?: string;
    updated?: string;
    deleted?: string;
  }>;
};

const quoteStates = [
  { value: "pendiente", label: "Pendientes" },
  { value: "aceptada", label: "Aceptadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "all", label: "Todas" },
];

const quoteActionClassName = "w-full justify-center text-center";

function matchesQuery(item: Awaited<ReturnType<typeof listQuotes>>[number], query: string) {
  if (!query) return true;
  return [item.quoteNumber, item.customer.name, item.customer.businessName, item.customer.taxId, item.createdBy]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function statusLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  if (!normalized) return "-";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function quoteStatusTone(value: string): StatusBadgeTone {
  if (value === "aceptada") return "success";
  if (value === "rechazada") return "danger";
  if (value === "pendiente") return "warning";
  return "neutral";
}

function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("54")) return digits;
  return `54${digits.replace(/^0+/, "")}`;
}

function quoteWhatsappHref(quote: Awaited<ReturnType<typeof listQuotes>>[number]) {
  const customer = quote.customer.name || quote.customer.businessName || "cliente";
  const pdfBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const pdfPath = `/api/pdfs/quotes/${encodeURIComponent(quote.quoteNumber)}`;
  const pdfUrl = pdfBase ? `${pdfBase}${pdfPath}` : pdfPath;
  const text = encodeURIComponent(
    [
      `Hola ${customer}, te enviamos el presupuesto de Starlim.`,
      `Presupuesto: ${quote.quoteNumber}.`,
      `Total: ${formatCurrency(quote.total)}.`,
      `PDF: ${pdfUrl}`,
    ].join("\n"),
  );
  const phone = whatsappPhone(quote.customer.phone);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [QUOTES_READ_PERMISSION]);
  const params = await searchParams;
  const status = params.status?.trim() || "pendiente";
  const query = params.q?.trim().toLowerCase() ?? "";
  const [canCreateQuotes, canApproveQuotes, canEditQuotes, canDeleteQuotes, rawQuotes, quoteFormData] = await Promise.all([
    sessionAllows(session, [QUOTES_CREATE_PERMISSION]),
    sessionAllows(session, [QUOTES_APPROVE_PERMISSION]),
    sessionAllows(session, [{ resource: "presupuestos", action: "editar" }]),
    sessionAllows(session, [{ resource: "presupuestos", action: "cancelar" }]),
    listQuotes(session.companyId, status === "all" ? "" : status),
    getOrderFormData(session.companyId),
  ]);
  const quotes = rawQuotes.filter((item) => matchesQuery(item, query));
  const total = quotes.reduce((sum, quote) => sum + quote.total, 0);
  const expired = quotes.filter((quote) => quote.valid === false).length;

  return (
    <ModulePage
      active="sales"
      description="Presupuestos formales y rapidos con totales calculados."
      session={session}
      title="Presupuestos"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Genera presupuestos formales para guardar o presupuestos rapidos para enviar por WhatsApp."
          moduleIntro
          title="Presupuestos"
        />

        {params.error ? (
          <p className="rounded-lg border border-[color:var(--danger)]/30 bg-white p-3 text-sm font-semibold text-[color:var(--danger)]">
            {params.error}
          </p>
        ) : null}

        {params.updated ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Presupuesto actualizado.
          </div>
        ) : null}
        {params.deleted ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Presupuesto eliminado.
          </div>
        ) : null}

        {canCreateQuotes ? (
        <Card>
          <QuoteEntryForm action={createQuoteAction} className="grid gap-4 p-4">
            <QuoteEntryFields
              clients={quoteFormData.clients}
              priceLists={quoteFormData.priceLists}
              products={quoteFormData.products}
            />
          </QuoteEntryForm>
        </Card>
        ) : null}

        <Toolbar ariaLabel="Filtros de presupuestos">
          <form
            action="/quotes"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto] lg:items-end"
          >
            <Field htmlFor="quotes-query" label="Buscar">
              <Input
                defaultValue={params.q ?? ""}
                id="quotes-query"
                name="q"
                placeholder="Cliente, razon social, CUIT o creador"
                type="search"
              />
            </Field>
            <Field htmlFor="quotes-status" label="Estado">
              <Select defaultValue={status} id="quotes-status" name="status">
                {quoteStates.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Filtrar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard icon={<MetricIcon name="document" />} label="Presupuestos filtrados" tone="accent" value={quotes.length} />
          <StatCard icon={<MetricIcon name="money" />} label="Total filtrado" tone="success" value={formatCurrency(total)} />
          <StatCard icon={<MetricIcon name="calendar" />} label="Vencidos en filtro" tone={expired > 0 ? "danger" : "warning"} value={expired} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de presupuestos filtrados"
            className="rounded-none border-0 shadow-none"
            minWidth="860px"
            tableLabel="Presupuestos"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[14%]">Presupuesto</DataTableHead>
                <DataTableHead className="w-[23%]">Cliente</DataTableHead>
                <DataTableHead className="w-[11%]">Emision</DataTableHead>
                <DataTableHead className="w-[12%]">Vencimiento</DataTableHead>
                <DataTableHead className="w-[12%]">Estado</DataTableHead>
                <DataTableHead align="right" className="w-[12%]">Total</DataTableHead>
                <DataTableHead className="w-[16%]">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {quotes.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState
                      description="Ajusta la busqueda o cambia el estado para encontrar presupuestos."
                      title="No hay presupuestos para los filtros actuales"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                quotes.map((quote) => (
                  <DataTableRow key={quote.id}>
                    <DataTableCell>
                      <div className="font-mono text-xs font-black">{quote.quoteNumber}</div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">{quote.createdBy || "-"}</div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-medium">
                        {quote.customer.name || quote.customer.businessName || "Sin cliente"}
                      </div>
                      <div className="mt-1 font-mono text-xs text-[color:var(--muted)]">
                        {quote.customer.taxId || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{formatDate(quote.issueDate)}</DataTableCell>
                    <DataTableCell className="whitespace-nowrap">
                      <div>{formatDate(quote.expirationDate)}</div>
                      {quote.valid === false ? (
                        <div className="mt-1 text-xs text-[color:var(--danger)]">Vencido</div>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={quoteStatusTone(quote.status)}>
                        {statusLabel(quote.status)}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatCurrency(quote.total)}
                    </DataTableCell>
                    <DataTableCell>
                      <details className="erp-action-menu">
                        <summary>
                          Acciones
                        </summary>
                        <div className="grid gap-1.5">
                          {quote.status === "pendiente" && canEditQuotes ? (
                            <ButtonLink
                              aria-label={`Editar presupuesto ${quote.quoteNumber}`}
                              className={quoteActionClassName}
                              href={`/quotes/${quote.id}/edit`}
                              size="sm"
                              variant="secondary"
                            >
                              Editar
                            </ButtonLink>
                          ) : null}
                          <ButtonLink
                            aria-label={`Abrir PDF del presupuesto ${quote.quoteNumber}`}
                            className={quoteActionClassName}
                            href={`/api/pdfs/quotes/${encodeURIComponent(quote.quoteNumber)}`}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="secondary"
                          >
                            PDF
                          </ButtonLink>
                          <ButtonLink
                            aria-label={`Enviar presupuesto ${quote.quoteNumber} por WhatsApp`}
                            className={quoteActionClassName}
                            href={quoteWhatsappHref(quote)}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="outline"
                          >
                            WhatsApp
                          </ButtonLink>
                          {quote.status === "pendiente" && canApproveQuotes ? (
                            <>
                              <form action={acceptQuoteAction}>
                                <input name="id" type="hidden" value={quote.id} />
                                {(quote.desiredDocument === "factura_a" || quote.desiredDocument === "factura_b")
                                  && hasFiscalCustomerData(quote.customer.taxId, quote.customer.vatCondition) ? (
                                  <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-md border border-[color:var(--border)] px-2 py-1.5 text-xs font-semibold text-[color:var(--text)]">
                                    <input name="requestFiscalInvoice" type="checkbox" value="true" />
                                    Solicitar factura fiscal
                                  </label>
                                ) : null}
                                <Button
                                  aria-label={`Aprobar presupuesto ${quote.quoteNumber}`}
                                  className={quoteActionClassName}
                                  size="sm"
                                  type="submit"
                                >
                                  Aprobar
                                </Button>
                              </form>
                            </>
                          ) : null}
                          {(quote.status === "pendiente" || quote.status === "rechazada") && canDeleteQuotes ? (
                            <QuoteDeleteButton action={deleteQuoteAction} quoteId={quote.id} quoteNumber={quote.quoteNumber} />
                          ) : null}
                        </div>
                      </details>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
