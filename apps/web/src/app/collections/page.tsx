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
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { listPendingCollections } from "@/lib/collections";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import {
  approveCollectionAction,
  rejectCollectionAction,
} from "@/app/collections/actions";

type CollectionsPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

function matchesQuery(item: Awaited<ReturnType<typeof listPendingCollections>>[number], query: string) {
  if (!query) return true;
  const haystack = [
    item.customerName,
    item.customerDocument,
    item.customerCode,
    item.customerTaxId,
    item.destination,
    item.operation,
    item.registeredBy,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function statusLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  if (!normalized) return "-";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function collectionStatusTone(value: string): StatusBadgeTone {
  if (value === "recibido") return "success";
  if (value === "pendiente_aprobacion" || value === "en_proceso") return "warning";
  return "neutral";
}

export default async function CollectionsPage({ searchParams }: CollectionsPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const allCollections = await listPendingCollections(session.companyId);
  const collections = allCollections.filter((item) => matchesQuery(item, query));
  const totalPending = collections.reduce((sum, item) => sum + item.registeredAmount, 0);

  return (
    <ModulePage
      active="collections"
      description="Cola de cobros registrados que administracion debe aprobar o rechazar."
      session={session}
      title="Cobros"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Revision de cobros registrados por usuarios antes de impactar cuentas corrientes y tesoreria."
          title="Cobranzas"
        />

        <Toolbar ariaLabel="Busqueda de cobros pendientes">
          <form
            action="/collections"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
          >
            <Field htmlFor="collections-query" label="Buscar">
              <Input
                defaultValue={params.q ?? ""}
                id="collections-query"
                name="q"
                placeholder="Cliente, CUIT, operacion o responsable"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-2">
          <StatCard className="p-3" label="Monto pendiente de aprobacion" value={formatCurrency(totalPending)} />
          <StatCard
            className="p-3"
            detail={`${collections.length} visibles con la busqueda actual`}
            label="Cola total sin filtro"
            value={allCollections.length}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Cobros pendientes de aprobacion"
            className="rounded-none border-0 shadow-none"
            minWidth="1180px"
            tableLabel="Cobros pendientes"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Venta</DataTableHead>
                <DataTableHead>Cliente</DataTableHead>
                <DataTableHead>Metodo</DataTableHead>
                <DataTableHead>Destino</DataTableHead>
                <DataTableHead>Fecha cobro</DataTableHead>
                <DataTableHead>Registrado por</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead>Comprobantes</DataTableHead>
                <DataTableHead align="right">Monto</DataTableHead>
                <DataTableHead>Accion</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {collections.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={10}>
                    <EmptyState
                      description="Ajusta la busqueda para revisar otros cobros pendientes de aprobacion."
                      title="No hay cobros pendientes para esta busqueda"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                collections.map((item) => {
                  const reasonInputId = `collection-${item.id}-reason`;

                  return (
                    <DataTableRow key={item.id}>
                      <DataTableCell>
                        <div className="font-mono text-xs">#{item.id}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          Remito {item.remittanceLabel}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="max-w-[220px] break-words font-medium">
                          {item.customerName || "Sin cliente"}
                        </div>
                        <div className="mt-1 font-mono text-xs text-[color:var(--muted)]">
                          {item.customerTaxId || item.customerDocument || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell>{item.method || "-"}</DataTableCell>
                      <DataTableCell>
                        <div className="max-w-[220px] break-words">{item.destination || "-"}</div>
                        <div className="mt-1 max-w-[220px] break-words text-xs leading-5 text-[color:var(--muted)]">
                          {item.operation || "Sin operacion"}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="whitespace-nowrap">{formatDate(item.collectionDate)}</DataTableCell>
                      <DataTableCell>{item.registeredBy || "-"}</DataTableCell>
                      <DataTableCell>
                        <StatusBadge tone={collectionStatusTone(item.status)}>
                          {statusLabel(item.status)}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell>
                        <ButtonLink
                          aria-label={`Abrir comprobantes asociados al cobro ${item.id}`}
                          href={`/api/sales-documents?saleId=${item.id}`}
                          prefetch={false}
                          rel="noreferrer"
                          size="sm"
                          target="_blank"
                          variant="secondary"
                        >
                          {item.associatedDocuments} asociados
                        </ButtonLink>
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(item.registeredAmount)}
                      </DataTableCell>
                      <DataTableCell>
                        <div className="grid min-w-[300px] gap-2">
                          <form action={approveCollectionAction}>
                            <input name="id" type="hidden" value={item.id} />
                            <Button
                              aria-label={`Aprobar cobro ${item.id}`}
                              className="w-full text-xs"
                              size="sm"
                              type="submit"
                            >
                              Aprobar
                            </Button>
                          </form>
                          <form action={rejectCollectionAction} className="flex min-w-0 gap-2">
                            <input name="id" type="hidden" value={item.id} />
                            <label className="sr-only" htmlFor={reasonInputId}>
                              Motivo de rechazo del cobro {item.id}
                            </label>
                            <Input
                              aria-describedby={`${reasonInputId}-hint`}
                              className="min-h-9 flex-1 px-2 text-xs"
                              id={reasonInputId}
                              name="reason"
                              placeholder="Motivo de rechazo"
                            />
                            <span className="sr-only" id={`${reasonInputId}-hint`}>
                              Este motivo se envia junto con el rechazo del cobro.
                            </span>
                            <Button
                              aria-label={`Rechazar cobro ${item.id}`}
                              className="min-h-9 px-3 text-xs"
                              size="sm"
                              type="submit"
                              variant="outline"
                            >
                              Rechazar
                            </Button>
                          </form>
                        </div>
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
