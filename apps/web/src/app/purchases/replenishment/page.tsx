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
import { formatCurrency, formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { getReplenishmentSuggestions, type ReplenishmentItem, type ReplenishmentPriority } from "@/lib/replenishment-v2";
import { PRODUCTS_READ_PERMISSION, PURCHASES_READ_PERMISSION } from "@/lib/route-auth";
import { ProductTrendsTable, StagnantProductsTable } from "@/app/purchases/replenishment/replenishment-insights";

function priorityLabel(priority: ReplenishmentPriority) {
  if (priority === "critico") return "Critico";
  if (priority === "alto") return "Alto";
  return "Medio";
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
      topPriority: "medio" as const,
    };
    group.items.push(item);
    group.units += item.suggestedQuantity;
    if (item.priority && PRIORITY_RANK[item.priority] < PRIORITY_RANK[group.topPriority]) group.topPriority = item.priority;
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
    view?: string;
    q?: string;
  }>;
};

export default async function ReplenishmentPage({ searchParams }: ReplenishmentPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [PURCHASES_READ_PERMISSION, PRODUCTS_READ_PERMISSION]);
  const params = await searchParams;
  const replenishment = await getReplenishmentSuggestions(session.companyId);
  const view = params.view === "tendencias" || params.view === "estancados" ? params.view : "reponer";
  const query = params.q?.trim().toLocaleLowerCase("es") ?? "";
  const matchesQuery = (item: ReplenishmentItem) =>
    !query || `${item.name} ${item.sku} ${item.supplier}`.toLocaleLowerCase("es").includes(query);
  const groups = groupBySupplier(replenishment.items.filter(matchesQuery));
  const trendItems = replenishment.insights
    .filter((item) => item.trend !== "estancado" && item.trend !== "sin_datos" && matchesQuery(item))
    .sort((left, right) => Math.abs(right.trendPercent ?? 0) - Math.abs(left.trendPercent ?? 0));
  const stagnantItems = replenishment.insights
    .filter((item) => item.trend === "estancado" && matchesQuery(item))
    .sort((left, right) => right.inventoryValue - left.inventoryValue);

  return (
    <ModulePage
      active="purchases"
      description="Plan de compra basado en demanda, seguridad, stock y mercadería en tránsito."
      session={session}
      title="Compras inteligentes"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Qué comprar, qué ya viene en camino y dónde quedó capital detenido."
          moduleIntro
          title="Centro inteligente de compras"
        />

        {params.created ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Pedido al proveedor creado correctamente y registrado como mercadería en tránsito.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            className="p-3"
            detail={`${replenishment.meta.analyzedProducts} productos analizados`}
            label="A recomprar"
            tone="accent"
            value={formatNumber(replenishment.meta.suggestedProducts)}
          />
          <StatCard
            className="p-3"
            detail="Sin stock efectivo y con venta reciente"
            label="Criticos"
            tone="danger"
            value={formatNumber(replenishment.meta.criticalProducts)}
          />
          <StatCard
            className="p-3"
            detail="Ya descontadas de la recomendación"
            label="Unidades en tránsito"
            tone="info"
            value={formatNumber(replenishment.meta.inTransitUnits)}
          />
          <StatCard
            className="p-3"
            detail={`${formatNumber(replenishment.meta.stagnantProducts)} productos sin venta en 90 días`}
            label="Capital estancado"
            tone="warning"
            value={formatCurrency(replenishment.meta.stagnantValue)}
          />
          <StatCard
            className="p-3"
            detail={`${formatNumber(replenishment.meta.suggestedUnits)} unidades sugeridas`}
            label="Compra estimada"
            tone="success"
            value={formatCurrency(replenishment.meta.suggestedValue)}
          />
        </div>

        <Card className="overflow-hidden border-[color:var(--accent)]/30">
          <div className="grid gap-3 bg-[linear-gradient(135deg,#f4f8ff_0%,#ffffff_100%)] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="font-black text-[color:var(--accent-strong)]">Demanda prevista + stock de seguridad − stock disponible − compras en tránsito</div>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Pondera más los últimos 30 días, usa {replenishment.meta.safetyDays} días de seguridad o el mínimo configurado y redondea al bulto de cada producto.
              </p>
            </div>
            <ButtonLink href="/purchases?view=nueva" variant="secondary">Registrar mercadería recibida</ButtonLink>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-2">
          <ButtonLink href="/purchases/replenishment" variant={view === "reponer" ? "primary" : "secondary"}>Plan de recompra</ButtonLink>
          <ButtonLink href="/purchases/replenishment?view=tendencias" variant={view === "tendencias" ? "primary" : "secondary"}>Tendencias</ButtonLink>
          <ButtonLink href="/purchases/replenishment?view=estancados" variant={view === "estancados" ? "primary" : "secondary"}>Stock estancado</ButtonLink>
          <form action="/purchases/replenishment" className="ml-auto flex min-w-[260px] flex-1 gap-2 sm:max-w-md">
            <input name="view" type="hidden" value={view} />
            <input aria-label="Buscar producto o proveedor" className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 text-sm" defaultValue={params.q ?? ""} name="q" placeholder="Buscar producto o proveedor" type="search" />
            <Button type="submit" variant="secondary">Buscar</Button>
          </form>
        </div>

        {view === "tendencias" ? <ProductTrendsTable items={trendItems} /> : null}
        {view === "estancados" ? <StagnantProductsTable items={stagnantItems} /> : null}
        {view === "reponer" && groups.length === 0 ? (
          <Card className="p-4">
            <EmptyState description="No hay productos con faltante segun el consumo reciente y el stock disponible." title="Sin recompra sugerida" />
          </Card>
        ) : view === "reponer" ? (
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
                      <ButtonLink href={`/purchases?view=planificar&mrpSupplier=${group.supplierId}`} size="sm">
                        Preparar pedido
                      </ButtonLink>
                    ) : (
                      <span className="text-xs text-[color:var(--muted)]">Sin proveedor asignado</span>
                    )}
                  </summary>
                  <DataTable caption={`Recompra sugerida para ${group.supplier}`} className="rounded-none border-x-0 border-b-0 shadow-none" minWidth="980px" tableLabel={`Recompra ${group.supplier}`}>
                    <DataTableHeader>
                      <DataTableRow className="hover:bg-transparent">
                        <DataTableHead>Producto</DataTableHead><DataTableHead align="right">Stock</DataTableHead><DataTableHead align="right">Pendiente</DataTableHead>
                        <DataTableHead align="right">Demanda</DataTableHead><DataTableHead align="right">Seguridad</DataTableHead><DataTableHead align="right">Stock + tránsito</DataTableHead>
                        <DataTableHead align="right">Cobertura</DataTableHead><DataTableHead align="right">Sugerido</DataTableHead><DataTableHead>Prioridad</DataTableHead>
                      </DataTableRow>
                    </DataTableHeader>
                    <DataTableBody>
                      {group.items.map((item) => (
                        <DataTableRow key={item.productId}>
                          <DataTableCell><div className="font-semibold">{item.name}</div><div className="mt-0.5 font-mono text-xs text-[color:var(--muted)]">{item.sku || item.productId}</div></DataTableCell>
                          <DataTableCell align="right">{formatNumber(item.currentStock)}</DataTableCell><DataTableCell align="right">{formatNumber(item.pendingPurchase)}</DataTableCell>
                          <DataTableCell align="right">{formatNumber(item.demandHorizon)}</DataTableCell><DataTableCell align="right">{formatNumber(item.safetyStock)}</DataTableCell>
                          <DataTableCell align="right" className="font-semibold">{formatNumber(item.effectiveStock)}</DataTableCell><DataTableCell align="right">{coverText(item.coverDays)}</DataTableCell>
                          <DataTableCell align="right" className="font-bold">{formatNumber(item.suggestedQuantity)}</DataTableCell>
                          <DataTableCell>{item.priority ? <StatusBadge tone={priorityTone(item.priority)}>{priorityLabel(item.priority)}</StatusBadge> : "-"}</DataTableCell>
                        </DataTableRow>
                      ))}
                    </DataTableBody>
                  </DataTable>
                </details>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </ModulePage>
  );
}
