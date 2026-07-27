import { ModulePage } from "@/components/module-page";
import {
  AppIcon,
  Button,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Field,
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
import { getOrderFormData } from "@/lib/orders";
import { listQuotes } from "@/lib/quotes";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import {
  QUOTES_APPROVE_PERMISSION,
  QUOTES_CREATE_PERMISSION,
  QUOTES_READ_PERMISSION,
  sessionAllows,
} from "@/lib/route-auth";
import { acceptQuoteAction, acceptQuoteAndRemitAction, createQuoteAction } from "@/app/quotes/actions";
import { QuoteEntryFields } from "@/app/quotes/quote-entry-fields";

type QuotesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

const quoteStates = [
  { value: "pendiente", label: "Pendientes" },
  { value: "aceptada", label: "Aceptadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "all", label: "Todas" },
];

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
  const [canCreateQuotes, canApproveQuotes, rawQuotes, quoteFormData] = await Promise.all([
    sessionAllows(session, [QUOTES_CREATE_PERMISSION]),
    sessionAllows(session, [QUOTES_APPROVE_PERMISSION]),
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

        {canCreateQuotes ? (
        <Card>
          <QuoteEntryFields
            action={createQuoteAction}
            clients={quoteFormData.clients}
            priceLists={quoteFormData.priceLists}
            products={quoteFormData.products}
          />
        </Card>
        ) : null}

        <Toolbar ariaLabel="Filtros de presupuestos">
          <form
            action="/quotes"
            className="grid w-full gap-4 lg:grid-cols-[minmax(320px,1fr)_260px_144px] lg:items-end"
          >
            <Field htmlFor="quotes-query" label="Buscar">
              <SearchInput
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
            <Button className="w-full" leadingIcon={<AppIcon name="filter" />} type="submit">
              Filtrar
            </Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard icon={<AppIcon className="h-6 w-6" name="quote" />} label="Presupuestos filtrados" tone="accent" value={quotes.length} />
          <StatCard icon={<AppIcon className="h-6 w-6" name="money" />} label="Total filtrado" tone="info" value={formatCurrency(total)} />
          <StatCard icon={<AppIcon className="h-6 w-6" name="clock" />} label="Vencidos en filtro" tone="warning" value={expired} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de presupuestos filtrados"
            className="rounded-none border-0 shadow-none"
            minWidth="980px"
            tableLabel="Presupuestos"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[14%]">Presupuesto</DataTableHead>
                <DataTableHead className="w-[24%]">Cliente</DataTableHead>
                <DataTableHead className="w-[11%]">Emision</DataTableHead>
                <DataTableHead className="w-[14%]">Vencimiento</DataTableHead>
                <DataTableHead className="w-[12%]">Estado</DataTableHead>
                <DataTableHead align="right" className="w-[10%]">Total</DataTableHead>
                <DataTableHead className="w-[15%]">Acciones</DataTableHead>
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
                      <div className="inline-flex max-w-full rounded-full bg-[#ececff] px-2.5 py-1 font-mono text-xs font-black text-[#4f46b8]">
                        {quote.quoteNumber}
                      </div>
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
                    <DataTableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <AppIcon className="h-4 w-4 text-[#64748b]" name="calendar" />
                        {formatDate(quote.issueDate)}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <AppIcon className="h-4 w-4 text-[#64748b]" name="calendar" />
                        {formatDate(quote.expirationDate)}
                      </div>
                      {quote.valid === false ? (
                        <div className="mt-1 text-xs text-[color:var(--danger)]">Vencido</div>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={quoteStatusTone(quote.status)}>
                        {statusLabel(quote.status)}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs font-black text-[#3347a8]">
                      {formatCurrency(quote.total)}
                    </DataTableCell>
                    <DataTableCell>
                      <TableActionMenu>
                        <a
                          aria-label={`Abrir PDF del presupuesto ${quote.quoteNumber}`}
                          className={tableActionItemClass}
                          href={`/api/pdfs/quotes/${encodeURIComponent(quote.quoteNumber)}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          PDF
                        </a>
                        <a
                          aria-label={`Enviar presupuesto ${quote.quoteNumber} por WhatsApp`}
                          className={tableActionItemClass}
                          href={quoteWhatsappHref(quote)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          WhatsApp
                        </a>
                        {quote.status === "pendiente" && canApproveQuotes ? (
                          <>
                            <form action={acceptQuoteAction}>
                              <input name="id" type="hidden" value={quote.id} />
                              <button
                                aria-label={`Aceptar presupuesto ${quote.quoteNumber}`}
                                className={tableActionItemClass}
                                type="submit"
                              >
                                Aceptar
                              </button>
                            </form>
                            <form action={acceptQuoteAndRemitAction}>
                              <input name="id" type="hidden" value={quote.id} />
                              <button
                                aria-label={`Aprobar y remitar presupuesto ${quote.quoteNumber}`}
                                className={tableActionItemClass}
                                type="submit"
                              >
                                Aprobar y remitar
                              </button>
                            </form>
                          </>
                        ) : null}
                      </TableActionMenu>
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
