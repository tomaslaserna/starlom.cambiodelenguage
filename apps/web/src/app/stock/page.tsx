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

function movementDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
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
          <StatCard label="Productos activos" tone="accent" value={formatNumber(products.length)} />
          <StatCard label="Unidades registradas" tone="success" value={formatNumber(totalStock)} />
          <StatCard label="Sin stock" tone="warning" value={formatNumber(withoutStock)} />
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

        <Card className="overflow-hidden border-[#bfe4dc]">
          <CardHeader className="border-[#bfe4dc] bg-[#f0faf7]">
            <CardTitle>Ultimos movimientos</CardTitle>
            <CardDescription>Historial comun para compras, ventas, recuentos y ajustes manuales.</CardDescription>
          </CardHeader>
          <DataTable
            caption="Ultimos movimientos de stock"
            className="rounded-none border-0 shadow-none"
            minWidth="860px"
            tableLabel="Movimientos de stock"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader className="border-[#bfe4dc] bg-[#eaf7f3] text-[#315b50]">
              <DataTableRow>
                <DataTableHead className="w-[14%]">Fecha</DataTableHead>
                <DataTableHead className="w-[32%]">Producto</DataTableHead>
                <DataTableHead align="right" className="w-[12%]">Cantidad</DataTableHead>
                <DataTableHead className="w-[24%]">Motivo</DataTableHead>
                <DataTableHead className="w-[18%]">Usuario</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {movements.length ? (
                movements.map((movement) => (
                  <DataTableRow className="even:bg-[#fbfefc]" key={movement.id}>
                    <DataTableCell className="whitespace-nowrap">
                      <span className="inline-flex rounded-full bg-[#e8f0ff] px-2.5 py-1 text-xs font-bold text-[#315ea8]">
                        {movementDate(movement.date)}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-semibold text-[#173b33]">{movement.productName}</div>
                    </DataTableCell>
                    <DataTableCell align="right">
                      <StatusBadge tone={movement.mode === "entrada" ? "success" : "warning"}>
                        {movement.mode === "entrada" ? "+" : "-"}{formatNumber(movement.quantity)}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell>
                      {movement.reason ? (
                        <details className="group rounded-[8px] border border-[#c6ddd7] bg-white open:bg-[#f6fbfa]">
                          <summary
                            className="flex min-h-8 list-none items-center justify-between gap-2 px-2.5 py-1 text-xs font-bold text-[#16705c] [&::-webkit-details-marker]:hidden"
                            title={movement.reason}
                          >
                            <span>Ver motivo</span>
                            <svg
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                            </svg>
                          </summary>
                          <div className="border-t border-[#dbe9e5] px-2.5 py-2 text-xs leading-5 text-[#405b54]">
                            {movement.reason}
                          </div>
                        </details>
                      ) : (
                        <span className="text-xs text-[color:var(--muted)]">Sin motivo</span>
                      )}
                    </DataTableCell>
                    <DataTableCell>{movement.actor || "Proceso automatico"}</DataTableCell>
                  </DataTableRow>
                ))
              ) : (
                <DataTableRow>
                  <DataTableCell colSpan={5}>
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
