import { ModulePage } from "@/components/module-page";
import { SectionTabs } from "@/components/section-tabs";
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
import { listQuotes } from "@/lib/quotes";
import { requireStaffSession } from "@/lib/auth";
import { acceptQuoteAction } from "@/app/quotes/actions";

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

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const status = params.status?.trim() || "pendiente";
  const query = params.q?.trim().toLowerCase() ?? "";
  const quotes = (await listQuotes(session.companyId, status === "all" ? "" : status)).filter((item) =>
    matchesQuery(item, query),
  );
  const total = quotes.reduce((sum, quote) => sum + quote.total, 0);
  const expired = quotes.filter((quote) => quote.valid === false).length;

  return (
    <ModulePage
      active="sales"
      description="Presupuestos comerciales migrados a Node, con estado, vencimiento y totales calculados."
      session={session}
      title="Presupuestos"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Seguimiento de presupuestos comerciales, vencimientos, importes y conversion a pedido."
          title="Presupuestos"
        />

        <SectionTabs
          tabs={[
            { href: "/sales", label: "Resumen" },
            { href: "/orders/new", label: "Cargar pedido" },
            { href: "/quotes", label: "Presupuestos", active: true },
          ]}
        />

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
                <DataTableHead>Accion</DataTableHead>
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
                      <div className="grid min-w-[132px] gap-2">
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
                        {quote.status === "pendiente" ? (
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
