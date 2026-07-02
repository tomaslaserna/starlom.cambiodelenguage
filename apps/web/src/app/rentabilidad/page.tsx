import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  StatCard,
  StatusBadge,
} from "@/components/ui";
import {
  createOperatingCostAction,
  deleteOperatingCostAction,
} from "@/app/rentabilidad/actions";
import { requireStaffSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { currentMonth } from "@/lib/month-range";
import { requirePagePermission } from "@/lib/page-auth";
import { getBreakEvenStatus, listOperatingCosts } from "@/lib/profitability";
import { ADMIN_METRICS_READ_PERMISSION } from "@/lib/route-auth";

type RentabilidadPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function RentabilidadPage({ searchParams }: RentabilidadPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_METRICS_READ_PERMISSION]);
  const { month: monthParam } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? (monthParam as string) : currentMonth();

  const [status, costs] = await Promise.all([
    getBreakEvenStatus(session.companyId, month),
    listOperatingCosts(session.companyId, month),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ModulePage
      active="admin"
      description="Costos operativos y punto de equilibrio del mes."
      session={session}
      title="Rentabilidad"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Rentabilidad"
          description={`Punto de equilibrio y costos del mes ${month}.`}
          actions={
            <form action="/rentabilidad" className="flex items-end gap-2">
              <Field htmlFor="rent-month" label="Mes">
                <Input defaultValue={month} id="rent-month" name="month" type="month" />
              </Field>
              <Button type="submit">Ver</Button>
            </form>
          }
        />

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Costos fijos del mes" value={formatCurrency(status.fixedCosts)} />
          <StatCard label="Margen acumulado" value={formatCurrency(status.accumulatedMargin)} />
          <StatCard
            label={status.reached ? "Punto de equilibrio" : "Faltante para PE"}
            value={status.reached ? "Alcanzado" : formatCurrency(status.remaining)}
          />
          <StatCard label="Rentabilidad del mes" value={formatCurrency(status.profit)} />
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <StatusBadge tone={status.reached ? "success" : "warning"}>
              {status.reached ? "PE alcanzado — ofertas habilitables" : "PE no alcanzado"}
            </StatusBadge>
            <span className="erp-text-body-sm text-[color:var(--muted)]">
              Ingresos {formatCurrency(status.revenue)} − COGS {formatCurrency(status.cogs)} = Margen{" "}
              {formatCurrency(status.accumulatedMargin)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nuevo costo operativo</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createOperatingCostAction} className="grid gap-3 md:grid-cols-4">
              <input name="month" type="hidden" value={month} />
              <Field htmlFor="cost-concept" label="Concepto">
                <Input id="cost-concept" name="concept" placeholder="Alquiler" required />
              </Field>
              <Field htmlFor="cost-amount" label="Monto">
                <Input id="cost-amount" min="0.01" name="amount" step="0.01" type="number" required />
              </Field>
              <Field htmlFor="cost-category" label="Categoria (opcional)">
                <Input id="cost-category" name="category" placeholder="Fijo" />
              </Field>
              <Field htmlFor="cost-date" label="Fecha">
                <Input defaultValue={today} id="cost-date" name="date" type="date" required />
              </Field>
              <div className="md:col-span-4">
                <Button type="submit">Agregar costo</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <DataTable caption="Costos operativos del mes" tableLabel="Costos operativos">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Concepto</DataTableHead>
                <DataTableHead>Categoria</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead align="right">Monto</DataTableHead>
                <DataTableHead align="right">Accion</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {costs.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState
                      description="Carga los costos fijos del mes con el formulario de arriba."
                      title="Sin costos cargados"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                costs.map((cost) => (
                  <DataTableRow key={cost.id}>
                    <DataTableCell className="font-medium">{cost.concept}</DataTableCell>
                    <DataTableCell>{cost.category || "—"}</DataTableCell>
                    <DataTableCell>{cost.date}</DataTableCell>
                    <DataTableCell align="right" className="font-mono">
                      {formatCurrency(cost.amount)}
                    </DataTableCell>
                    <DataTableCell align="right">
                      <form action={deleteOperatingCostAction}>
                        <input name="id" type="hidden" value={cost.id} />
                        <input name="month" type="hidden" value={month} />
                        <Button size="sm" type="submit" variant="secondary">
                          Eliminar
                        </Button>
                      </form>
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
