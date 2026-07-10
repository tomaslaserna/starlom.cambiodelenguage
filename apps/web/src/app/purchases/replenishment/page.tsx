import { ModulePage } from "@/components/module-page";
import { ButtonLink, Card, EmptyState, PageHeader, StatCard, StatusBadge, type StatusBadgeTone } from "@/components/ui";
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

export default async function ReplenishmentPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [PURCHASES_READ_PERMISSION, PRODUCTS_READ_PERMISSION]);
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

                  <div className="overflow-x-auto border-t border-[color:var(--border)]">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Producto</th>
                          <th className="px-4 py-2 text-right font-semibold">Stock</th>
                          <th className="px-4 py-2 text-right font-semibold">Pendiente</th>
                          <th className="px-4 py-2 text-right font-semibold">Venta 90d</th>
                          <th className="px-4 py-2 text-right font-semibold">Cobertura</th>
                          <th className="px-4 py-2 text-right font-semibold">Sugerido</th>
                          <th className="px-4 py-2 font-semibold">Prioridad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => (
                          <tr className="border-t border-[color:var(--border)]" key={item.productId}>
                            <td className="px-4 py-2">
                              <div className="break-words font-semibold">{item.name}</div>
                              <div className="mt-0.5 font-mono text-xs text-[color:var(--muted)]">
                                {item.sku || item.productId}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{formatNumber(item.currentStock)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{formatNumber(item.pendingPurchase)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{formatNumber(item.sold90)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{coverText(item.coverDays)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs font-bold">
                              {formatNumber(item.suggestedQuantity)}
                            </td>
                            <td className="px-4 py-2">
                              <StatusBadge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</StatusBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ModulePage>
  );
}
