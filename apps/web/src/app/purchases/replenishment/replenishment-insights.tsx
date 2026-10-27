import {
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { ProductTrend, ReplenishmentItem } from "@/lib/replenishment-v2";

function trendLabel(trend: ProductTrend) {
  if (trend === "alza") return "En alza";
  if (trend === "baja") return "En baja";
  if (trend === "estable") return "Estable";
  if (trend === "estancado") return "Estancado";
  return "Sin datos";
}

function trendTone(trend: ProductTrend): StatusBadgeTone {
  if (trend === "alza") return "success";
  if (trend === "baja") return "warning";
  if (trend === "estancado") return "danger";
  if (trend === "estable") return "info";
  return "neutral";
}

export function ProductTrendsTable({ items }: { items: ReplenishmentItem[] }) {
  return (
    <Card className="overflow-hidden">
      <DataTable caption="Tendencias de demanda por producto" className="rounded-none border-0 shadow-none" minWidth="900px" tableLabel="Tendencias">
        <DataTableHeader>
          <DataTableRow className="hover:bg-transparent">
            <DataTableHead>Producto</DataTableHead>
            <DataTableHead>Proveedor</DataTableHead>
            <DataTableHead align="right">Últimos 30 días</DataTableHead>
            <DataTableHead align="right">30 días anteriores</DataTableHead>
            <DataTableHead align="right">Variación</DataTableHead>
            <DataTableHead align="right">Stock + tránsito</DataTableHead>
            <DataTableHead>Tendencia</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          {items.length ? items.map((item) => (
            <DataTableRow key={item.productId}>
              <DataTableCell><div className="font-semibold">{item.name}</div><div className="mt-0.5 font-mono text-xs text-[color:var(--muted)]">{item.sku || item.productId}</div></DataTableCell>
              <DataTableCell>{item.supplier}</DataTableCell>
              <DataTableCell align="right">{formatNumber(item.sold30)}</DataTableCell>
              <DataTableCell align="right">{formatNumber(item.soldPrevious30)}</DataTableCell>
              <DataTableCell align="right" className={item.trend === "alza" ? "font-black text-[color:var(--success)]" : item.trend === "baja" ? "font-black text-[color:var(--warning)]" : ""}>
                {item.trendPercent === null ? "-" : `${item.trendPercent >= 0 ? "+" : ""}${item.trendPercent.toLocaleString("es-AR", { maximumFractionDigits: 0 })}%`}
              </DataTableCell>
              <DataTableCell align="right">{formatNumber(item.effectiveStock)}</DataTableCell>
              <DataTableCell><StatusBadge tone={trendTone(item.trend)}>{trendLabel(item.trend)}</StatusBadge></DataTableCell>
            </DataTableRow>
          )) : (
            <DataTableRow className="hover:bg-transparent"><DataTableCell colSpan={7}><EmptyState title="Sin tendencias para mostrar" description="No hay productos que coincidan con la búsqueda actual." /></DataTableCell></DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}

export function StagnantProductsTable({ items }: { items: ReplenishmentItem[] }) {
  return (
    <Card className="overflow-hidden">
      <DataTable caption="Productos con stock y sin venta reciente" className="rounded-none border-0 shadow-none" minWidth="860px" tableLabel="Stock estancado">
        <DataTableHeader>
          <DataTableRow className="hover:bg-transparent">
            <DataTableHead>Producto</DataTableHead>
            <DataTableHead>Proveedor</DataTableHead>
            <DataTableHead align="right">Stock</DataTableHead>
            <DataTableHead align="right">Capital inmovilizado</DataTableHead>
            <DataTableHead>Última venta</DataTableHead>
            <DataTableHead align="right">Días sin venta</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          {items.length ? items.map((item) => (
            <DataTableRow key={item.productId}>
              <DataTableCell><div className="font-semibold">{item.name}</div><div className="mt-0.5 font-mono text-xs text-[color:var(--muted)]">{item.sku || item.productId}</div></DataTableCell>
              <DataTableCell>{item.supplier}</DataTableCell>
              <DataTableCell align="right">{formatNumber(item.currentStock)}</DataTableCell>
              <DataTableCell align="right" className="font-black text-[color:var(--danger)]">{formatCurrency(item.inventoryValue)}</DataTableCell>
              <DataTableCell>{item.lastSaleDate ? formatDate(item.lastSaleDate) : "Sin ventas registradas"}</DataTableCell>
              <DataTableCell align="right">{item.daysSinceLastSale === null ? "-" : formatNumber(item.daysSinceLastSale)}</DataTableCell>
            </DataTableRow>
          )) : (
            <DataTableRow className="hover:bg-transparent"><DataTableCell colSpan={6}><EmptyState title="Sin stock estancado" description="No hay productos con stock y cero ventas en los últimos 90 días." /></DataTableCell></DataTableRow>
          )}
        </DataTableBody>
      </DataTable>
    </Card>
  );
}
