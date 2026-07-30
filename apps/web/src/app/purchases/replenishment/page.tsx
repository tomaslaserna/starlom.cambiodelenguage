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
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { createReplenishmentPurchaseRequestAction } from "@/app/purchases/replenishment/actions";
import { formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { getReplenishmentSuggestions, type ReplenishmentPriority } from "@/lib/replenishment";
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

        <Card className="overflow-hidden">
          <DataTable
            caption="Recompra sugerida por producto"
            className="rounded-none border-0 shadow-none"
            minWidth="1180px"
            tableLabel="Recompra MRP"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[21%]">Producto</DataTableHead>
                <DataTableHead className="w-[15%]">Proveedor</DataTableHead>
                <DataTableHead align="right" className="w-[9%]">Stock</DataTableHead>
                <DataTableHead align="right" className="w-[9%]">Pendiente</DataTableHead>
                <DataTableHead align="right" className="w-[9%]">Venta 90d</DataTableHead>
                <DataTableHead align="right" className="w-[9%]">Cobertura</DataTableHead>
                <DataTableHead align="right" className="w-[9%]">Sugerido</DataTableHead>
                <DataTableHead className="w-[9%]">Prioridad</DataTableHead>
                <DataTableHead align="center" className="w-[10%] px-2">Accion</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {replenishment.items.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={9}>
                    <EmptyState
                      description="No hay productos con faltante segun el consumo reciente y el stock disponible."
                      title="Sin recompra sugerida"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                replenishment.items.map((item) => (
                  <DataTableRow key={item.productId}>
                    <DataTableCell>
                      <div className="break-words font-semibold">{item.name}</div>
                      <div className="mt-1 font-mono text-xs text-[color:var(--muted)]">{item.sku || item.productId}</div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="break-words text-[color:var(--muted)]">{item.supplier}</div>
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
                    <DataTableCell align="center" className="min-w-[118px] px-2 py-2">
                      {item.supplierId && item.suggestedQuantity > 0 ? (
                        <form action={createReplenishmentPurchaseRequestAction} className="flex justify-center">
                          <input name="productId" type="hidden" value={item.productId} />
                          <input name="quantity" type="hidden" value={item.suggestedQuantity} />
                          <Button
                            aria-label={`Solicitar recompra de ${item.name}`}
                            className="min-w-[106px] whitespace-nowrap"
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
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
