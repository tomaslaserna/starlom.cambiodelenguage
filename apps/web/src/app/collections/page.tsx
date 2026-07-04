import { ModulePage } from "@/components/module-page";
import {
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
  Input,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Toolbar,
} from "@/components/ui";
import { listSalesToCollect } from "@/lib/collections";
import { formatCurrency, formatDate } from "@/lib/format";
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
  const overdueCount = sales.filter((item) => item.overdue).length;
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

        <div className="grid gap-3 md:grid-cols-2">
          <StatCard
            className="p-3"
            detail="Calculado sobre las ventas visibles"
            label="Saldo total a cobrar"
            value={formatCurrency(totalOutstanding)}
          />
          <StatCard
            className="p-3"
            detail={`${sales.length} ventas visibles con la busqueda actual`}
            label="Ventas vencidas"
            value={overdueCount}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Ventas entregadas con saldo pendiente"
            className="rounded-none border-0 shadow-none"
            minWidth="0"
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
                <DataTableHead className="w-[14%] px-2">Accion</DataTableHead>
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
                  const amountInputId = `sale-${item.id}-amount`;
                  const dateInputId = `sale-${item.id}-date`;
                  const methodSelectId = `sale-${item.id}-method`;
                  const destinationInputId = `sale-${item.id}-destination`;
                  const operationInputId = `sale-${item.id}-operation`;
                  const notesInputId = `sale-${item.id}-notes`;

                  return (
                    <DataTableRow key={item.id}>
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
                      <DataTableCell className="truncate px-2 py-2 text-xs">
                        {desiredDocumentLabel(item.desiredDocument)}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        {awaitingApproval(item) ? (
                          <div>
                            <StatusBadge tone="warning">En aprobacion</StatusBadge>
                            <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                              {formatCurrency(item.registeredAmount)} registrado
                            </div>
                          </div>
                        ) : canRegister ? (
                          <details className="rounded-md border border-[color:var(--border)] bg-white px-2 py-1.5">
                            <summary className="cursor-pointer select-none text-xs font-black text-[color:var(--accent-strong)]">
                              Registrar cobro
                            </summary>
                            <form action={registerCollectionAction} className="mt-2 grid gap-2">
                              <input name="id" type="hidden" value={item.id} />
                              <Field htmlFor={amountInputId} label="Monto">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  defaultValue={item.outstandingAmount.toFixed(2)}
                                  id={amountInputId}
                                  max={item.outstandingAmount.toFixed(2)}
                                  min="0.01"
                                  name="amount"
                                  required
                                  step="0.01"
                                  type="number"
                                />
                              </Field>
                              <Field htmlFor={dateInputId} label="Fecha">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  defaultValue={today}
                                  id={dateInputId}
                                  name="date"
                                  required
                                  type="date"
                                />
                              </Field>
                              <Field htmlFor={methodSelectId} label="Metodo">
                                <Select
                                  className="min-h-9 px-2 text-xs"
                                  defaultValue="efectivo"
                                  id={methodSelectId}
                                  name="method"
                                >
                                  <option value="efectivo">Efectivo</option>
                                  <option value="transferencia">Transferencia</option>
                                  <option value="echeck">E-check</option>
                                </Select>
                              </Field>
                              <Field htmlFor={destinationInputId} label="Destino">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  defaultValue="Caja"
                                  id={destinationInputId}
                                  name="destination"
                                  placeholder="Cuenta o caja"
                                  required
                                />
                              </Field>
                              <Field htmlFor={operationInputId} label="Operacion">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  id={operationInputId}
                                  name="operation"
                                  placeholder="Nro. o referencia"
                                />
                              </Field>
                              <Field htmlFor={notesInputId} label="Notas">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  id={notesInputId}
                                  name="notes"
                                  placeholder="Opcional"
                                />
                              </Field>
                              <Button className="min-h-9 px-3 text-xs" size="sm" type="submit">
                                Registrar
                              </Button>
                            </form>
                          </details>
                        ) : (
                          <span className="text-xs text-[color:var(--muted)]">Sin permiso</span>
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
