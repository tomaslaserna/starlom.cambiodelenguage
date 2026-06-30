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
import { sessionCanReadCollections } from "@/lib/route-auth";
import { redirect } from "next/navigation";
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
  if (!(await sessionCanReadCollections(session))) redirect("/");

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
          <StatCard
            className="p-3"
            detail="Calculado sobre los cobros visibles"
            label="Monto visible pendiente de aprobacion"
            value={formatCurrency(totalPending)}
          />
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
            minWidth="0"
            tableLabel="Cobros pendientes"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[11%] px-2">Venta</DataTableHead>
                <DataTableHead className="w-[18%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[20%] px-2">Cobro</DataTableHead>
                <DataTableHead className="w-[12%] px-2">Registro</DataTableHead>
                <DataTableHead className="w-[13%] px-2">Estado</DataTableHead>
                <DataTableHead align="right" className="w-[11%] px-2">Monto</DataTableHead>
                <DataTableHead className="w-[15%] px-2">Accion</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {collections.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
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
                      <DataTableCell className="px-2 py-2">
                        <div className="truncate font-mono text-xs">#{item.id.slice(0, 8)}</div>
                        <div className="mt-1 truncate text-xs text-[color:var(--muted)]">
                          Remito {item.remittanceLabel}
                        </div>
                        <ButtonLink
                          aria-label={`Abrir comprobantes asociados al cobro ${item.id}`}
                          className="mt-2 h-8 px-2 text-[11px]"
                          href={`/api/sales-documents?saleId=${item.id}`}
                          prefetch={false}
                          rel="noreferrer"
                          size="sm"
                          target="_blank"
                          variant="secondary"
                        >
                          {item.associatedDocuments} comp.
                        </ButtonLink>
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="truncate font-medium">
                          {item.customerName || "Sin cliente"}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-[color:var(--muted)]">
                          {item.customerTaxId || item.customerDocument || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="truncate font-medium">{item.method || "-"}</div>
                        <div className="mt-1 truncate text-xs leading-5 text-[color:var(--muted)]">
                          {item.destination || "-"} · {item.operation || "Sin operacion"}
                        </div>
                        {item.notes ? (
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--muted)]">
                            {item.notes}
                          </div>
                        ) : null}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="whitespace-nowrap text-xs">{formatDate(item.collectionDate)}</div>
                        <div className="mt-1 truncate text-xs text-[color:var(--muted)]">
                          {item.registeredBy || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <StatusBadge tone={collectionStatusTone(item.status)}>
                          {statusLabel(item.status)}
                        </StatusBadge>
                        <div className="mt-2 text-xs leading-5 text-[color:var(--muted)]">
                          Saldo actual {formatCurrency(item.outstandingAmount)}
                        </div>
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                        <div>{formatCurrency(item.registeredAmount)}</div>
                        <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                          Queda {formatCurrency(item.outstandingAfterApproval)}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="grid gap-2">
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
                          <form action={rejectCollectionAction} className="grid gap-2">
                            <input name="id" type="hidden" value={item.id} />
                            <label className="sr-only" htmlFor={reasonInputId}>
                              Motivo de rechazo del cobro {item.id}
                            </label>
                            <Input
                              aria-describedby={`${reasonInputId}-hint`}
                              className="min-h-9 px-2 text-xs"
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
