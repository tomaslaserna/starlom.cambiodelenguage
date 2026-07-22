import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
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
} from "@/components/ui";
import { createStockMovementAction } from "@/app/stock/actions";
import { StockBulkImport } from "@/app/stock/stock-bulk-import";
import { StockProductWorkspace } from "@/app/stock/stock-product-workspace";
import { requireStaffSession } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { listInventoryProducts, listRecentStockMovements } from "@/lib/inventory";
import { PRODUCTS_READ_PERMISSION, sessionAllows, STOCK_EDIT_PERMISSION } from "@/lib/route-auth";

type StockPageProps = {
  searchParams: Promise<{ mode?: string; status?: string; error?: string }>;
};

function movementLabel(type: string) {
  const labels: Record<string, string> = {
    ajuste_negativo: "Salida manual",
    ajuste_positivo: "Entrada manual",
    entrada_compra: "Compra acreditada",
    salida_mayorista: "Salida mayorista",
    salida_minorista: "Salida minorista",
    salida_venta: "Venta / pedido",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function movementDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionAllows(session, [PRODUCTS_READ_PERMISSION]))) redirect("/");
  const params = await searchParams;
  const canEdit = await sessionAllows(session, [STOCK_EDIT_PERMISSION]);
  if (params.mode === "bulk" && !canEdit) redirect("/stock");

  const [products, movements] = await Promise.all([
    listInventoryProducts(session.companyId),
    listRecentStockMovements(session.companyId),
  ]);
  const totalStock = products.reduce((total, product) => total + product.stock, 0);
  const withoutStock = products.filter((product) => product.stock <= 0).length;

  return (
    <ModulePage
      active="stock"
      description="Modifica cantidades y consulta el detalle de cada producto sin perder el historial de movimientos."
      session={session}
      title="Modificación de productos"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Cada cambio queda como movimiento auditable; el stock nunca se reemplaza silenciosamente."
          moduleIntro
          title={params.mode === "bulk" ? "Carga masiva de stock" : "Modificación de producto"}
        />

        {params.error ? (
          <div className="rounded-[var(--radius-md)] border border-[color:var(--danger)] bg-[color:var(--danger-subtle)] p-3 text-sm font-semibold text-[color:var(--danger)]" role="alert">
            {params.error}
          </div>
        ) : null}
        {params.status ? (
          <div className="rounded-[var(--radius-md)] border border-[color:var(--success)] bg-[color:var(--success-subtle)] p-3 text-sm font-semibold text-[color:var(--success)]" role="status">
            {params.status === "created"
              ? "Movimiento registrado correctamente."
              : params.status === "duplicate"
                ? "Ese movimiento ya habia sido procesado; no se duplico."
                : "El recuento coincide con el stock actual; no fue necesario crear un movimiento."}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="Productos activos" value={formatNumber(products.length)} />
          <StatCard label="Unidades registradas" value={formatNumber(totalStock)} />
          <StatCard label="Sin stock" value={formatNumber(withoutStock)} />
        </div>

        {params.mode === "bulk" ? (
          <StockBulkImport />
        ) : (
          <StockProductWorkspace
            action={createStockMovementAction}
            canEdit={canEdit}
            idempotencyKey={randomUUID()}
            products={products}
          />
        )}

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Ultimos movimientos</CardTitle>
            <CardDescription>Historial comun para compras, ventas, recuentos y ajustes manuales.</CardDescription>
          </CardHeader>
          <DataTable
            caption="Ultimos movimientos de stock"
            className="rounded-none border-0 shadow-none"
            minWidth="960px"
            tableLabel="Movimientos de stock"
          >
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead>Origen</DataTableHead>
                <DataTableHead align="right">Cantidad</DataTableHead>
                <DataTableHead>Motivo</DataTableHead>
                <DataTableHead>Usuario</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {movements.length ? (
                movements.map((movement) => (
                  <DataTableRow key={movement.id}>
                    <DataTableCell className="whitespace-nowrap">{movementDate(movement.date)}</DataTableCell>
                    <DataTableCell>
                      <div className="font-semibold">{movement.productName}</div>
                      <div className="font-mono text-xs text-[color:var(--muted)]">{movement.productCode || "Sin codigo"}</div>
                    </DataTableCell>
                    <DataTableCell>{movementLabel(movement.type)}</DataTableCell>
                    <DataTableCell align="right">
                      <StatusBadge tone={movement.mode === "entrada" ? "success" : "warning"}>
                        {movement.mode === "entrada" ? "+" : "-"}{formatNumber(movement.quantity)}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell>{movement.reason || "-"}</DataTableCell>
                    <DataTableCell>{movement.actor || "Proceso automatico"}</DataTableCell>
                  </DataTableRow>
                ))
              ) : (
                <DataTableRow>
                  <DataTableCell colSpan={6}>
                    <EmptyState title="Sin movimientos" description="Los cambios de stock apareceran en este historial." />
                  </DataTableCell>
                </DataTableRow>
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
