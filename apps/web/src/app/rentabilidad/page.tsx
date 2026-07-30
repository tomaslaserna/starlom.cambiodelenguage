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
  StatCard,
  StatusBadge,
  Toolbar,
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
import { localDateIso } from "@/lib/timezone";

type RentabilidadPageProps = {
  searchParams: Promise<{ month?: string }>;
};

type RentabilidadIconName =
  | "add"
  | "calendar"
  | "category"
  | "chart"
  | "costs"
  | "loss"
  | "margin"
  | "tag"
  | "target"
  | "trash"
  | "warning";

function RentabilidadIcon({ name }: { name: RentabilidadIconName }) {
  if (name === "costs") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M4 7.5h14a2 2 0 0 1 2 2V18H6a2 2 0 0 1-2-2V7.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M4 8V6a2 2 0 0 1 2-2h11v3.5M16 12h4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "margin") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="m4 16 5-5 4 3 7-8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M15 6h5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "target") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <circle cx="11" cy="13" r="7" stroke="currentColor" strokeWidth="2" />
        <circle cx="11" cy="13" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="m13 11 7-7m-4 0h4v4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "loss") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="m4 8 5 5 4-3 7 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M15 18h5v-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" />
        <path d="M7 3v4m10-4v4M3 10h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "chart") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M5 19V9m7 10V5m7 14v-7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "tag") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M4 5h7l9 9-6 6-9-9V5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <circle cx="8.5" cy="8.5" fill="currentColor" r="1.25" />
      </svg>
    );
  }

  if (name === "category") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9H3V7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "trash") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "warning") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M12 4 3.5 19h17L12 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 9v4m0 3h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="16" x="4" y="4" />
      <path d="M12 8v8m-4-4h8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function FieldIcon({ name }: { name: RentabilidadIconName }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-[#60708a] [&>svg]:h-[18px] [&>svg]:w-[18px]"
    >
      <RentabilidadIcon name={name} />
    </span>
  );
}

export default async function RentabilidadPage({ searchParams }: RentabilidadPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_METRICS_READ_PERMISSION]);
  const { month: monthParam } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? (monthParam as string) : currentMonth();

  const [status, costs] = await Promise.all([
    getBreakEvenStatus(session.companyId, month),
    listOperatingCosts(session.companyId, month),
  ]);
  const today = localDateIso();

  return (
    <ModulePage
      active="admin"
      description="Costos operativos y punto de equilibrio del mes."
      session={session}
      title="Rentabilidad"
    >
      <div className="grid gap-5">
        <Toolbar
          ariaLabel="Filtro de rentabilidad"
          className="min-h-[116px] items-center p-5 shadow-[var(--shadow-sm)] sm:p-6"
        >
          <form action="/rentabilidad" className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <Field className="w-full sm:max-w-[275px]" htmlFor="rent-month" label="Mes">
              <div className="relative">
                <FieldIcon name="calendar" />
                <Input
                  className="w-full pl-10"
                  defaultValue={month}
                  id="rent-month"
                  name="month"
                  type="month"
                />
              </div>
            </Field>
            <Button
              className="min-w-[105px]"
              leadingIcon={<span className="block h-[18px] w-[18px] [&>svg]:h-full [&>svg]:w-full"><RentabilidadIcon name="chart" /></span>}
              type="submit"
            >
              Ver
            </Button>
          </form>
        </Toolbar>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            className="min-h-[128px] px-5 py-4"
            icon={<RentabilidadIcon name="costs" />}
            label="Costos fijos del mes"
            tone="accent"
            value={formatCurrency(status.fixedCosts)}
          />
          <StatCard
            className="min-h-[128px] px-5 py-4"
            icon={<RentabilidadIcon name="margin" />}
            label="Margen acumulado"
            tone={status.accumulatedMargin >= 0 ? "success" : "danger"}
            value={formatCurrency(status.accumulatedMargin)}
          />
          <StatCard
            className="min-h-[128px] px-5 py-4"
            icon={<RentabilidadIcon name="target" />}
            label={status.reached ? "Punto de equilibrio" : "Faltante para PE"}
            tone={status.reached ? "success" : "warning"}
            value={status.reached ? "Alcanzado" : formatCurrency(status.remaining)}
          />
          <StatCard
            className="min-h-[128px] px-5 py-4"
            icon={<RentabilidadIcon name="loss" />}
            label="Rentabilidad del mes"
            tone={status.profit >= 0 ? "success" : "danger"}
            value={formatCurrency(status.profit)}
          />
        </div>

        <Card>
          <CardContent className="flex min-h-[72px] flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
            <StatusBadge className="min-h-8 gap-2 px-3.5" tone={status.reached ? "success" : "warning"}>
              <span className="block h-4 w-4 [&>svg]:h-full [&>svg]:w-full">
                <RentabilidadIcon name={status.reached ? "target" : "warning"} />
              </span>
              {status.reached ? "PE alcanzado — ofertas habilitables" : "PE no alcanzado"}
            </StatusBadge>
            <span className="erp-text-body-sm font-medium text-[color:var(--muted)]">
              Ingresos {formatCurrency(status.revenue)} − COGS {formatCurrency(status.cogs)} = Margen{" "}
              {formatCurrency(status.accumulatedMargin)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b-0 bg-white px-5 pb-2 pt-5">
            <CardTitle className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-[6px] border-2 border-[#75a3ff] text-[#2563eb] [&>svg]:h-[18px] [&>svg]:w-[18px]">
                <RentabilidadIcon name="add" />
              </span>
              Nuevo costo operativo
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-2">
            <form action={createOperatingCostAction} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <input name="month" type="hidden" value={month} />
              <Field htmlFor="cost-concept" label="Concepto">
                <div className="relative">
                  <FieldIcon name="tag" />
                  <Input className="w-full pl-10" id="cost-concept" name="concept" placeholder="Alquiler" required />
                </div>
              </Field>
              <Field htmlFor="cost-amount" label="Monto">
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center border-r border-[color:var(--border)] font-semibold text-[#60708a]"
                  >
                    $
                  </span>
                  <Input
                    className="w-full pl-12"
                    id="cost-amount"
                    min="0.01"
                    name="amount"
                    step="0.01"
                    type="number"
                    required
                  />
                </div>
              </Field>
              <Field htmlFor="cost-category" label="Categoria (opcional)">
                <div className="relative">
                  <FieldIcon name="category" />
                  <Input className="w-full pl-10" id="cost-category" name="category" placeholder="Fijo" />
                </div>
              </Field>
              <Field htmlFor="cost-date" label="Fecha">
                <div className="relative">
                  <FieldIcon name="calendar" />
                  <Input
                    className="w-full pl-10"
                    defaultValue={today}
                    id="cost-date"
                    name="date"
                    type="date"
                    required
                  />
                </div>
              </Field>
              <div className="sm:col-span-2 xl:col-span-4">
                <Button
                  leadingIcon={<span className="block h-[18px] w-[18px] [&>svg]:h-full [&>svg]:w-full"><RentabilidadIcon name="add" /></span>}
                  type="submit"
                >
                  Agregar costo
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <DataTable
            caption="Costos operativos del mes"
            className="rounded-none border-0 shadow-none"
            tableLabel="Costos operativos"
          >
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
                        <Button
                          leadingIcon={<span className="block h-4 w-4 [&>svg]:h-full [&>svg]:w-full"><RentabilidadIcon name="trash" /></span>}
                          size="sm"
                          type="submit"
                          variant="secondary"
                        >
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
