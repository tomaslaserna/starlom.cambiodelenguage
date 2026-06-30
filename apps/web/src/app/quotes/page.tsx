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
  Select,
  StatCard,
  StatusBadge,
  Toolbar,
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
  return [item.customer.name, item.customer.businessName, item.customer.taxId, item.createdBy]
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
  const pdfPath = `/api/pdfs/quotes/${quote.id}`;
  const pdfUrl = pdfBase ? `${pdfBase}${pdfPath}` : pdfPath;
  const text = encodeURIComponent(
    [
      `Hola ${customer}, te enviamos el presupuesto de Starlim.`,
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
          title="Presupuestos"
        />

        {canCreateQuotes ? (
        <Card>
          <form action={createQuoteAction} className="grid gap-4 p-4">
            <QuoteEntryFields clients={quoteFormData.clients} products={quoteFormData.products} />
          </form>
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
          <StatCard className="p-3" label="Presupuestos filtrados" value={quotes.length} />
          <StatCard className="p-3" label="Total filtrado" value={formatCurrency(total)} />
          <StatCard className="p-3" label="Vencidos en filtro" value={expired} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de presupuestos filtrados"
            className="rounded-none border-0 shadow-none"
            minWidth="1040px"
            tableLabel="Presupuestos"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Presupuesto</DataTableHead>
                <DataTableHead>Cliente</DataTableHead>
                <DataTableHead>Emision</DataTableHead>
                <DataTableHead>Vencimiento</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead align="right">Neto</DataTableHead>
                <DataTableHead align="right">IVA</DataTableHead>
                <DataTableHead align="right">Total</DataTableHead>
                <DataTableHead>Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {quotes.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={9}>
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
                      <div className="font-mono text-xs">#{quote.id}</div>
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
                      {formatCurrency(quote.subtotal)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatCurrency(quote.vatAmount)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatCurrency(quote.total)}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="grid min-w-[168px] gap-2">
                        <ButtonLink
                          aria-label={`Abrir PDF del presupuesto ${quote.id}`}
                          href={`/api/pdfs/quotes/${quote.id}`}
                          prefetch={false}
                          rel="noreferrer"
                          size="sm"
                          target="_blank"
                          variant="secondary"
                        >
                          PDF
                        </ButtonLink>
                        <ButtonLink
                          aria-label={`Enviar presupuesto ${quote.id} por WhatsApp`}
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
                              <Button
                                aria-label={`Aceptar presupuesto ${quote.id}`}
                                className="w-full"
                                size="sm"
                                type="submit"
                              >
                                Aceptar
                              </Button>
                            </form>
                            <form action={acceptQuoteAndRemitAction}>
                              <input name="id" type="hidden" value={quote.id} />
                              <Button
                                aria-label={`Aprobar y remitar presupuesto ${quote.id}`}
                                className="w-full"
                                size="sm"
                                type="submit"
                                variant="secondary"
                              >
                                Aprobar y remitar
                              </Button>
                            </form>
                          </>
                        ) : (
                          <span className="text-xs text-[color:var(--muted)]">Sin accion</span>
                        )}
                      </div>
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
