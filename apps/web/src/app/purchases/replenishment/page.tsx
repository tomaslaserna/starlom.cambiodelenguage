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
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { createReplenishmentPurchaseRequestAction } from "@/app/purchases/replenishment/actions";
import { formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { getReplenishmentSuggestions, type ReplenishmentItem, type ReplenishmentPriority } from "@/lib/replenishment";
import { PRODUCTS_READ_PERMISSION, PURCHASES_READ_PERMISSION } from "@/lib/route-auth";

function priorityLabel(priority: ReplenishmentPriority) {
  if (priority === "critico") return "Critico";
  if (priority === "alto") return "Alto";
  if (priority === "medio") return "Medio";
  return "Sin movimiento";
}

function priorityTone(priority: ReplenishmentPriority): StatusBadgeTone {
  if (priority === "critico") return "danger";
  if (priority === "alto") return "warning";
  return "neutral";
}

const PRIORITY_RANK: Record<ReplenishmentPriority, number> = {
  critico: 0,
  alto: 1,
  medio: 2,
  sin_movimiento: 3,
};

function coverText(value: number | null) {
  if (value === null) return "-";
  if (value > 999) return "+999 dias";
  return `${formatNumber(value)} dias`;
}

type SupplierGroup = {
  supplierId: string | null;
  supplier: string;
  items: ReplenishmentItem[];
  units: number;
  topPriority: ReplenishmentPriority;
};

function groupBySupplier(items: ReplenishmentItem[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();
  for (const item of items) {
    const key = item.supplierId ?? "__none__";
    let group = map.get(key);
    if (!group) {
      group = { supplierId: item.supplierId, supplier: item.supplier, items: [], units: 0, topPriority: "sin_movimiento" };
      map.set(key, group);
    }
    group.items.push(item);
    group.units += item.suggestedQuantity;
    if (PRIORITY_RANK[item.priority] < PRIORITY_RANK[group.topPriority]) group.topPriority = item.priority;
  }
  return Array.from(map.values()).sort((a, b) => {
    // proveedores con proveedor primero, luego por prioridad, luego por unidades
    if ((a.supplierId === null) !== (b.supplierId === null)) return a.supplierId === null ? 1 : -1;
    if (PRIORITY_RANK[a.topPriority] !== PRIORITY_RANK[b.topPriority]) {
      return PRIORITY_RANK[a.topPriority] - PRIORITY_RANK[b.topPriority];
    }
    return b.units - a.units;
  });
}

type ReplenishmentPageProps = {
  searchParams: Promise<{
    created?: string;
  }>;
};

export default async function ReplenishmentPage({ searchParams }: ReplenishmentPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [PURCHASES_READ_PERMISSION, PRODUCTS_READ_PERMISSION]);
  const params = await searchParams;
  const replenishment = await getReplenishmentSuggestions(session.companyId);
  const groups = groupBySupplier(replenishment.items);

  return (
    <ModulePage
      active="purchases"
      description="Recompra sugerida por consumo real, stock actual y compras pendientes."
      session={session}
      title="Recompra MRP"
    >
      <div className="grid gap-5">
        <PageHeader
          description={`Calcula faltantes para cubrir ${replenishment.meta.targetDays} dias usando ventas entregadas de los ultimos ${replenishment.meta.salesWindowDays} dias.`}
          moduleIntro
          title="Recompra MRP"
        />

        {params.created ? (
          <div
            className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]"
            role="status"
          >
            Solicitud de compra MRP enviada a Solicitudes y aprobaciones.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            className="p-3"
            detail="Productos con faltante o cobertura baja"
            label="Sugerencias"
            value={formatNumber(replenishment.meta.analyzedProducts)}
          />
          <StatCard
            className="p-3"
            detail="Sin stock efectivo y con venta reciente"
            label="Criticos"
            value={formatNumber(replenishment.meta.criticalProducts)}
          />
          <StatCard
            className="p-3"
            detail={`Unidades sugeridas para cubrir ${replenishment.meta.targetDays} dias`}
            label="Unidades a recomprar"
            value={formatNumber(replenishment.meta.suggestedUnits)}
          />
        </div>

        {groups.length === 0 ? (
          <Card className="p-4">
            <EmptyState
              description="No hay productos con faltante segun el consumo reciente y el stock disponible."
              title="Sin recompra sugerida"
            />
          </Card>
        ) : (
          <div className="grid gap-3">
            {groups.map((group) => (
              <Card className="overflow-hidden p-0" key={group.supplierId ?? "sin-proveedor"}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="erp-text-caption w-3 shrink-0 text-center transition-transform group-open:rotate-90"
                    >
                      &gt;
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-black">{group.supplier}</span>
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-xs font-bold text-white">
                        🔔 {group.items.length} {group.items.length === 1 ? "articulo" : "articulos"}
                      </span>
                      <span className="ml-2 text-xs text-[color:var(--muted)]">
                        {formatNumber(group.units)} unidades sugeridas
                      </span>
                    </span>
                    <StatusBadge tone={priorityTone(group.topPriority)}>{priorityLabel(group.topPriority)}</StatusBadge>
                    {group.supplierId ? (
                      <ButtonLink href={`/purchases?view=nueva&mrpSupplier=${group.supplierId}`} size="sm">
                        Mandar a nueva compra
                      </ButtonLink>
                    ) : (
                      <span className="text-xs text-[color:var(--muted)]">Sin proveedor asignado</span>
                    )}
                  </summary>

                  <DataTable
                    caption={`Recompra sugerida para ${group.supplier}`}
                    className="rounded-none border-x-0 border-b-0 shadow-none"
                    minWidth="980px"
                    tableLabel={`Recompra MRP de ${group.supplier}`}
                    tableProps={{ className: "table-fixed" }}
                  >
                    <DataTableHeader>
                      <DataTableRow className="hover:bg-transparent">
                        <DataTableHead className="w-[32%]">Producto</DataTableHead>
                        <DataTableHead align="right" className="w-[10%]">Stock</DataTableHead>
                        <DataTableHead align="right" className="w-[10%]">Pendiente</DataTableHead>
                        <DataTableHead align="right" className="w-[10%]">Venta 90d</DataTableHead>
                        <DataTableHead align="right" className="w-[11%]">Cobertura</DataTableHead>
                        <DataTableHead align="right" className="w-[10%]">Sugerido</DataTableHead>
                        <DataTableHead className="w-[9%]">Prioridad</DataTableHead>
                        <DataTableHead className="w-[8%]">Accion</DataTableHead>
                      </DataTableRow>
                    </DataTableHeader>
                    <DataTableBody>
                      {group.items.map((item) => (
                        <DataTableRow key={item.productId}>
                          <DataTableCell>
                            <div className="break-words font-semibold">{item.name}</div>
                            <div className="mt-0.5 font-mono text-xs text-[color:var(--muted)]">
                              {item.sku || item.productId}
                            </div>
                          </DataTableCell>
                          <DataTableCell align="right" className="font-mono text-xs">
                            {formatNumber(item.currentStock)}
                          </DataTableCell>
                          <DataTableCell align="right" className="font-mono text-xs">
                            {formatNumber(item.pendingPurchase)}
                          </DataTableCell>
                          <DataTableCell align="right" className="font-mono text-xs">
                            {formatNumber(item.sold90)}
                          </DataTableCell>
                          <DataTableCell align="right" className="font-mono text-xs">
                            {coverText(item.coverDays)}
                          </DataTableCell>
                          <DataTableCell align="right" className="font-mono text-xs font-bold">
                            {formatNumber(item.suggestedQuantity)}
                          </DataTableCell>
                          <DataTableCell>
                            <StatusBadge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</StatusBadge>
                          </DataTableCell>
                          <DataTableCell>
                            {item.supplierId && item.suggestedQuantity > 0 ? (
                              <form action={createReplenishmentPurchaseRequestAction}>
                                <input name="productId" type="hidden" value={item.productId} />
                                <input name="quantity" type="hidden" value={item.suggestedQuantity} />
                                <Button
                                  aria-label={`Solicitar recompra de ${item.name}`}
                                  className="w-full"
                                  size="sm"
                                  type="submit"
                                >
                                  Solicitar
                                </Button>
                              </form>
                            ) : (
                              <span className="text-xs text-[color:var(--muted)]">Sin proveedor</span>
                            )}
                          </DataTableCell>
                        </DataTableRow>
                      ))}
                    </DataTableBody>
                  </DataTable>
                </details>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ModulePage>
  );
}
