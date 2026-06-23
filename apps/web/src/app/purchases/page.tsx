import { ModulePage } from "@/components/module-page";
import { SectionTabs } from "@/components/section-tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { listPurchases } from "@/lib/purchases";
import { requireStaffSession } from "@/lib/auth";
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
import {
  updatePurchaseStatusAction,
  uploadPurchaseReceiptAction,
} from "@/app/purchases/actions";

type PurchasesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
  }>;
};

const purchaseStates = [
  { value: "", label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "recibida", label: "Recibida" },
  { value: "cancelada", label: "Cancelada" },
];

function matchesQuery(item: Awaited<ReturnType<typeof listPurchases>>[number], query: string) {
  if (!query) return true;
  return [item.supplierName, item.description, item.status, item.type]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function statusLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  if (!normalized) return "-";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function purchaseStatusTone(value: string): StatusBadgeTone {
  if (value === "recibida") return "success";
  if (value === "cancelada") return "danger";
  if (value === "pendiente") return "warning";
  return "neutral";
}

function packageStatusTone(value: string): StatusBadgeTone {
  const normalized = value.toLowerCase();
  if (normalized === "revisado") return "success";
  if (normalized === "falla") return "danger";
  if (normalized) return "warning";
  return "neutral";
}

export default async function PurchasesPage({ searchParams }: PurchasesPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const status = params.status?.trim() ?? "";
  const type = params.type?.trim() ?? "";
  const allPurchases = await listPurchases(session.companyId);
  const purchases = allPurchases.filter(
    (item) =>
      matchesQuery(item, query) &&
      (!status || item.status === status) &&
      (!type || item.type === type || item.type.toLowerCase().includes(type.toLowerCase())),
  );
  const openBalance = purchases.reduce((sum, item) => sum + item.balance, 0);
  const total = purchases.reduce((sum, item) => sum + item.total, 0);

  return (
    <ModulePage
      active="purchases"
      description="Compras, recepcion de paquetes y saldo proveedor desde la capa Node migrada."
      session={session}
      title="Compras"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Seguimiento de compras, recepcion de paquetes, saldos pendientes y documentacion PDF."
          title="Gestion de compras"
        />

        <SectionTabs
          tabs={[
            { href: "/purchases", label: "Nueva compra", active: !type },
            {
              href: "/purchases?type=urgente",
              label: "Urgentes",
              active: type === "urgente",
              badge: allPurchases.filter((item) => item.type.toLowerCase().includes("urg")).length,
            },
            { href: "/purchases?type=anticipada", label: "Anticipadas", active: type === "anticipada" },
            { href: "/purchases?type=solicitud", label: "Solicitudes de compra", active: type === "solicitud" },
          ]}
        />

        <Toolbar ariaLabel="Filtros de compras">
          <form
            action="/purchases"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto_auto] lg:items-end"
          >
            <Field htmlFor="purchases-query" label="Buscar">
              <Input
                defaultValue={params.q ?? ""}
                id="purchases-query"
                name="q"
                placeholder="Proveedor, descripcion o tipo"
                type="search"
              />
            </Field>
            <Field htmlFor="purchases-status" label="Estado">
              <Select defaultValue={status} id="purchases-status" name="status">
                {purchaseStates.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Filtrar</Button>
            <ButtonLink href="/purchases" variant="secondary">
              Limpiar
            </ButtonLink>
            {type ? <input name="type" type="hidden" value={type} /> : null}
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard className="p-3" label="Compras filtradas" value={purchases.length} />
          <StatCard className="p-3" label="Total filtrado" value={formatCurrency(total)} />
          <StatCard className="p-3" label="Saldo abierto" value={formatCurrency(openBalance)} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de compras filtradas"
            className="rounded-none border-0 shadow-none"
            minWidth="1120px"
            tableLabel="Compras"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Compra</DataTableHead>
                <DataTableHead>Proveedor</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead>Paquete</DataTableHead>
                <DataTableHead align="right">Total</DataTableHead>
                <DataTableHead align="right">Pagado</DataTableHead>
                <DataTableHead align="right">Saldo</DataTableHead>
                <DataTableHead>Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {purchases.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={9}>
                    <EmptyState
                      description="Ajusta la busqueda o limpia los filtros para volver al listado completo."
                      title="No hay compras para los filtros actuales"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                purchases.map((purchase) => {
                  const statusSelectId = `purchase-${purchase.id}-status`;
                  const receiptInputId = `purchase-${purchase.id}-receipt`;

                  return (
                    <DataTableRow key={purchase.id}>
                      <DataTableCell>
                        <div className="font-mono text-xs">#{purchase.id}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          {purchase.description || purchase.type || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-medium">{purchase.supplierName || "Sin proveedor"}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">{purchase.type || "-"}</div>
                      </DataTableCell>
                      <DataTableCell className="whitespace-nowrap">{formatDate(purchase.date)}</DataTableCell>
                      <DataTableCell>
                        <StatusBadge tone={purchaseStatusTone(purchase.status)}>
                          {statusLabel(purchase.status)}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell>
                        <StatusBadge tone={packageStatusTone(purchase.packageStatus)}>
                          {statusLabel(purchase.packageStatus)}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(purchase.total)}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(purchase.paidAmount)}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(purchase.balance)}
                      </DataTableCell>
                      <DataTableCell>
                        <div className="grid min-w-[300px] gap-2">
                          <div className="flex gap-2">
                            <ButtonLink
                              aria-label={`Abrir orden de compra PDF ${purchase.id}`}
                              className="flex-1"
                              href={`/api/pdfs/purchases/${purchase.id}/order`}
                              prefetch={false}
                              rel="noreferrer"
                              size="sm"
                              target="_blank"
                              variant="secondary"
                            >
                              OC PDF
                            </ButtonLink>
                            <ButtonLink
                              aria-label={`Abrir solicitud de devolucion PDF ${purchase.id}`}
                              className="flex-1"
                              href={`/api/pdfs/purchases/${purchase.id}/return-request`}
                              prefetch={false}
                              rel="noreferrer"
                              size="sm"
                              target="_blank"
                              variant="secondary"
                            >
                              Devol.
                            </ButtonLink>
                          </div>
                          <form action={updatePurchaseStatusAction} className="flex min-w-0 gap-2">
                            <input name="id" type="hidden" value={purchase.id} />
                            <label className="sr-only" htmlFor={statusSelectId}>
                              Cambiar estado de compra {purchase.id}
                            </label>
                            <Select
                              className="min-h-9 flex-1 px-2 text-xs"
                              defaultValue={purchase.status}
                              id={statusSelectId}
                              name="status"
                            >
                              {purchaseStates.slice(1).map((state) => (
                                <option key={state.value} value={state.value}>
                                  {state.label}
                                </option>
                              ))}
                            </Select>
                            <Button
                              aria-label={`Guardar estado de compra ${purchase.id}`}
                              className="min-h-9 px-3 text-xs"
                              size="sm"
                              type="submit"
                            >
                              Guardar
                            </Button>
                          </form>
                          {purchase.status === "recibida" ? (
                            <form action={uploadPurchaseReceiptAction} className="grid gap-2">
                              <input name="id" type="hidden" value={purchase.id} />
                              <Field className="gap-1" htmlFor={receiptInputId} label="Recibo">
                                <input
                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                  aria-label={`Seleccionar recibo de compra ${purchase.id}`}
                                  className="block w-full text-xs text-[color:var(--muted)] file:mr-2 file:min-h-9 file:rounded-[var(--radius-md)] file:border-0 file:bg-[color:var(--panel-subtle)] file:px-3 file:text-xs file:font-semibold file:text-[color:var(--foreground)]"
                                  id={receiptInputId}
                                  name="foto"
                                  type="file"
                                />
                              </Field>
                              <Button
                                aria-label={`Subir recibo de compra ${purchase.id}`}
                                className="w-full text-xs"
                                size="sm"
                                type="submit"
                                variant="secondary"
                              >
                                Subir recibo
                              </Button>
                            </form>
                          ) : null}
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
