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
  if (priority === "medio") return "neutral";
  return "neutral";
}

const PRIORITY_RANK: Record<ReplenishmentPriority, number> = {
  critico: 0,
  alto: 1,
  medio: 2,
  sin_movimiento: 3,
};

type SupplierGroup = {
  supplierId: string | null;
  supplier: string;
  items: ReplenishmentItem[];
  units: number;
  topPriority: ReplenishmentPriority;
};

function groupBySupplier(items: ReplenishmentItem[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  for (const item of items) {
    const key = item.supplierId ?? "__none__";
    const group = groups.get(key) ?? {
      supplierId: item.supplierId,
      supplier: item.supplier,
      items: [],
      units: 0,
      topPriority: "sin_movimiento" as const,
    };
    group.items.push(item);
    group.units += item.suggestedQuantity;
    if (PRIORITY_RANK[item.priority] < PRIORITY_RANK[group.topPriority]) group.topPriority = item.priority;
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((left, right) => {
    if ((left.supplierId === null) !== (right.supplierId === null)) return left.supplierId === null ? 1 : -1;
    return PRIORITY_RANK[left.topPriority] - PRIORITY_RANK[right.topPriority] || right.units - left.units;
  });
}

function coverText(value: number | null) {
  if (value === null) return "-";
  if (value > 999) return "+999 dias";
  return `${formatNumber(value)} dias`;
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
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
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
            <EmptyState description="No hay productos con faltante segun el consumo reciente y el stock disponible." title="Sin recompra sugerida" />
          </Card>
        ) : (
          <div className="grid gap-3">
            {groups.map((group) => (
              <Card className="overflow-hidden p-0" key={group.supplierId ?? "sin-proveedor"}>
                <details className="group">
                  <summary className="flex min-h-[var(--control-height-lg)] cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                    <span aria-hidden="true" className="w-3 shrink-0 text-center transition-transform group-open:rotate-90">›</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-black">{group.supplier}</span>
                      <span className="ml-2 rounded-full bg-[color:var(--accent-subtle)] px-2 py-0.5 text-xs font-bold text-[color:var(--accent-strong)]">
                        {group.items.length} {group.items.length === 1 ? "articulo" : "articulos"}
                      </span>
                      <span className="ml-2 text-xs text-[color:var(--muted)]">{formatNumber(group.units)} unidades sugeridas</span>
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
                  <DataTable caption={`Recompra sugerida para ${group.supplier}`} className="rounded-none border-x-0 border-b-0 shadow-none" minWidth="980px" tableLabel={`Recompra ${group.supplier}`}>
                    <DataTableHeader>
                      <DataTableRow className="hover:bg-transparent">
                        <DataTableHead>Producto</DataTableHead><DataTableHead align="right">Stock</DataTableHead><DataTableHead align="right">Pendiente</DataTableHead>
                        <DataTableHead align="right">Venta 90d</DataTableHead><DataTableHead align="right">Cobertura</DataTableHead><DataTableHead align="right">Sugerido</DataTableHead>
                        <DataTableHead>Prioridad</DataTableHead><DataTableHead align="center">Accion</DataTableHead>
                      </DataTableRow>
                    </DataTableHeader>
                    <DataTableBody>
                      {group.items.map((item) => (
                        <DataTableRow key={item.productId}>
                          <DataTableCell><div className="font-semibold">{item.name}</div><div className="mt-0.5 font-mono text-xs text-[color:var(--muted)]">{item.sku || item.productId}</div></DataTableCell>
                          <DataTableCell align="right">{formatNumber(item.currentStock)}</DataTableCell><DataTableCell align="right">{formatNumber(item.pendingPurchase)}</DataTableCell>
                          <DataTableCell align="right">{formatNumber(item.sold90)}</DataTableCell><DataTableCell align="right">{coverText(item.coverDays)}</DataTableCell>
                          <DataTableCell align="right" className="font-bold">{formatNumber(item.suggestedQuantity)}</DataTableCell>
                          <DataTableCell><StatusBadge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</StatusBadge></DataTableCell>
                          <DataTableCell align="center">
                            {item.supplierId ? (
                              <form action={createReplenishmentPurchaseRequestAction} className="flex justify-center">
                                <input name="productId" type="hidden" value={item.productId} /><input name="quantity" type="hidden" value={item.suggestedQuantity} />
                                <Button aria-label={`Solicitar recompra de ${item.name}`} size="sm" type="submit">Solicitar</Button>
                              </form>
                            ) : <span className="text-xs text-[color:var(--muted)]">Sin proveedor</span>}
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
