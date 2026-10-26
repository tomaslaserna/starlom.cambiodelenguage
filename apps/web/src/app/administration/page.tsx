import Link from "next/link";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/module-page";
import { getAdministrationMonthClosure } from "@/lib/administration-closure";
import {
  AppIcon,
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
  Field,
  Input,
  MoneyInput,
  Select,
  StatCard,
  StatusBadge,
  TableHoverActionMenu,
  cn,
} from "@/components/ui";
import { getAccountsPayable, getAccumulatedOperatingResult, getCashflow } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";
import { getBalanceDashboard, getBankReconciliationSummary, getBankReconciliationWorkspace, getTreasuryBalances } from "@/lib/finance";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { currentMonth } from "@/lib/month-range";
import { requirePagePermission } from "@/lib/page-auth";
import { periodLabel, type Period } from "@/lib/period-range";
import { getBreakEvenStatus, listScheduledOperatingCosts } from "@/lib/profitability";
import {
  ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,
  ADMIN_ACCOUNTS_PAYABLE_WRITE_PERMISSION,
  ADMIN_BALANCE_READ_PERMISSION,
  ADMIN_BALANCE_WRITE_PERMISSION,
  ADMIN_METRICS_READ_PERMISSION,
  ADMIN_METRICS_WRITE_PERMISSION,
  ADMIN_TREASURY_READ_PERMISSION,
  ADMIN_TREASURY_WRITE_PERMISSION,
  sessionAllows,
} from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import {
  archiveAdministrationCostAction,
  closeAdministrationMonthAction,
  createAdministrationCostAction,
  createAdministrationPayableAction,
  reopenAdministrationMonthAction,
  scheduleAdministrationSupplierPaymentAction,
  setAdministrationCostMonthAction,
  updateAdministrationCostAction,
} from "./actions";
import { AdministrationDemo } from "./administration-demo";
import { TreasuryWorkspace } from "./treasury-workspace";

type AdministrationView = "control" | "results" | "treasury" | "obligations" | "equity";

type AdministrationPageProps = {
  searchParams: Promise<{ view?: string; month?: string; period?: string; notice?: string }>;
};

const views: Array<{
  key: AdministrationView;
  label: string;
  description: string;
  icon: "chart" | "trend" | "wallet" | "receipt" | "money";
}> = [
  { key: "control", label: "Control", description: "Qué necesita atención hoy", icon: "chart" },
  { key: "results", label: "Resultados", description: "Rentabilidad del período", icon: "trend" },
  { key: "treasury", label: "Tesorería", description: "Caja real y proyectada", icon: "wallet" },
  { key: "obligations", label: "Obligaciones", description: "Todo lo pendiente de pago", icon: "receipt" },
  { key: "equity", label: "Patrimonio", description: "Activos menos pasivos", icon: "money" },
];

function parseView(value: string | undefined): AdministrationView {
  return views.some((view) => view.key === value) ? (value as AdministrationView) : "control";
}

function parseMonth(value: string | undefined) {
  return /^\d{4}-\d{2}$/.test(value ?? "") ? (value as string) : currentMonth();
}

function percentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Sin base comparable";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% vs. período anterior`;
}

function daysFromToday(date: string | null, today: string) {
  if (!date) return Number.POSITIVE_INFINITY;
  const target = new Date(`${date.slice(0, 10)}T12:00:00`);
  const base = new Date(`${today}T12:00:00`);
  return Math.floor((target.getTime() - base.getTime()) / 86_400_000);
}

function sourceLabel(source: string) {
  return {
    compra: "Proveedor",
    sueldo: "Sueldo",
    impuesto: "Impuesto",
    servicio: "Costo operativo",
    echeq: "E-cheq emitido",
  }[source] ?? source;
}

function ConfidenceNote({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "info" | "success" }) {
  const classes = {
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    info: "border-sky-200 bg-sky-50 text-sky-950",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  }[tone];

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", classes)}>
      <AppIcon className="mt-0.5 h-5 w-5 shrink-0" name={tone === "success" ? "trend" : "warning"} />
      <div>{children}</div>
    </div>
  );
}

function AdministrationTabs({ active, month }: { active: AdministrationView; month: string }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-[#dbe3ec] bg-white p-2 shadow-[var(--shadow-sm)] sm:grid-cols-2 xl:grid-cols-5">
      {views.map((view) => (
        <Link
          className={cn(
            "flex min-h-[72px] items-center gap-3 rounded-xl px-3 py-3 transition-colors",
            active === view.key
              ? "bg-[#0b63d8] text-white shadow-[0_8px_20px_rgba(11,99,216,0.2)]"
              : "text-[#334155] hover:bg-[#f1f5f9]",
          )}
          href={`/administration?view=${view.key}&month=${month}`}
          key={view.key}
        >
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", active === view.key ? "bg-white/14" : "bg-[#eef4ff] text-[#2563eb]")}>
            <AppIcon className="h-5 w-5" name={view.icon} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold">{view.label}</span>
            <span className={cn("mt-0.5 block truncate text-xs", active === view.key ? "text-white/75" : "text-[#64748b]")}>
              {view.description}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default async function AdministrationPage({ searchParams }: AdministrationPageProps) {
  const params = await searchParams;
  const view = parseView(params.view);
  const month = parseMonth(params.month ?? params.period);

  const missingLocalDatabase =
    process.env.NODE_ENV === "development" &&
    (!process.env.SUPABASE_DB_HOST || !process.env.SUPABASE_DB_USER || !process.env.SUPABASE_DB_PASS);

  if (missingLocalDatabase) {
    return <AdministrationDemo month={month} view={view} />;
  }

  const session = await requireStaffSession();
  const viewPermission = {
    control: ADMIN_BALANCE_READ_PERMISSION,
    results: ADMIN_METRICS_READ_PERMISSION,
    treasury: ADMIN_TREASURY_READ_PERMISSION,
    obligations: ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,
    equity: ADMIN_BALANCE_READ_PERMISSION,
  }[view];
  await requirePagePermission(session, [viewPermission]);
  const period: Period = { kind: "month", key: month };
  const today = localDateIso();

  const [
    dashboard,
    treasury,
    payables,
    cashflow,
    profitability,
    operatingCosts,
    accumulated,
    reconciliation,
    closure,
    reconciliationWorkspace,
    canWriteMetrics,
    canWriteTreasury,
    canWritePayables,
    canClosePeriods,
  ] = await Promise.all([
    getBalanceDashboard(session.companyId, period),
    getTreasuryBalances(session.companyId),
    getAccountsPayable(session.companyId),
    getCashflow(session.companyId),
    getBreakEvenStatus(session.companyId, month),
    listScheduledOperatingCosts(session.companyId, month),
    getAccumulatedOperatingResult(session.companyId, month),
    getBankReconciliationSummary(session.companyId, period),
    getAdministrationMonthClosure(session.companyId, month),
    getBankReconciliationWorkspace(session.companyId, period),
    sessionAllows(session, [ADMIN_METRICS_WRITE_PERMISSION]),
    sessionAllows(session, [ADMIN_TREASURY_WRITE_PERMISSION]),
    sessionAllows(session, [ADMIN_ACCOUNTS_PAYABLE_WRITE_PERMISSION]),
    sessionAllows(session, [ADMIN_BALANCE_WRITE_PERMISSION]),
  ]);

  const { metrics } = dashboard;
  const overduePayables = payables.data.filter((item) => daysFromToday(item.date, today) < 0);
  const dueSoonPayables = payables.data.filter((item) => {
    const days = daysFromToday(item.date, today);
    return days >= 0 && days <= 7;
  });
  const assets = treasury.meta.total + metrics.receivables.openTotal + metrics.stock.value;
  const liabilities = payables.meta.total;
  const netEquity = assets - liabilities;
  const grossMarginPercent = metrics.sales.current > 0
    ? (metrics.margin.grossProfit / metrics.sales.current) * 100
    : 0;
  const suspendedIndefiniteCosts = operatingCosts.filter((cost) => cost.durationMonths === null && !cost.included && !cost.payrollEmployee);
  const payrollDuplicates = operatingCosts.filter((cost) => cost.payrollEmployee);
  const closeChecks = [
    { label: "Costos de ventas completos", ready: profitability.complete, detail: profitability.complete ? "Todos los remitos tienen costo comprobable" : `${profitability.missingCostSales} ventas sin costo` },
    { label: "Conciliación bancaria completa", ready: reconciliation.ready, detail: reconciliation.ready ? "Extractos sin diferencias pendientes" : `${reconciliation.pendingLines + reconciliation.partialLines} movimientos a revisar` },
    { label: "Costos fijos confirmados", ready: suspendedIndefiniteCosts.length === 0, detail: suspendedIndefiniteCosts.length === 0 ? "No quedan costos indefinidos suspendidos" : `${suspendedIndefiniteCosts.length} costos requieren decisión` },
  ];
  const closeReady = closeChecks.every((check) => check.ready);

  return (
    <ModulePage
      active="administration"
      description="Centro unificado de control económico y financiero de Starlim."
      session={session}
      title="Administración"
    >
      <div className="grid gap-5">
        {params.notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            {params.notice}
          </div>
        ) : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="accent">Administración V2</StatusBadge>
              <StatusBadge tone="warning">Datos operativos · sin cierre contable</StatusBadge>
            </div>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.03em] text-[#0f172a]">
              {views.find((item) => item.key === view)?.label} · {periodLabel(period)}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[#64748b]">
              Una sola lectura para decidir. Cada cifra indica si representa resultado, liquidez, obligación o patrimonio.
            </p>
          </div>
          <form action="/administration" className="flex min-w-0 flex-wrap items-end gap-2">
            <input name="view" type="hidden" value={view} />
            <Field htmlFor="administration-month" label="Período de análisis">
              <Input defaultValue={month} id="administration-month" name="month" type="month" />
            </Field>
            <button className="h-10 rounded-lg bg-[#0b63d8] px-4 text-sm font-bold text-white hover:bg-[#084fae]" type="submit">
              Ver
            </button>
          </form>
        </div>

        <AdministrationTabs active={view} month={month} />

        {view === "control" ? (
          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard detail={`${formatCurrency(treasury.meta.available)} disponible · ${formatCurrency(treasury.meta.echecks)} en E-cheqs`} label="Tesorería total" tone="accent" value={formatCurrency(treasury.meta.total)} />
              <StatCard detail={`${payables.meta.count} obligaciones abiertas`} label="Por pagar" tone={overduePayables.length > 0 ? "danger" : "warning"} value={formatCurrency(payables.meta.total)} />
              <StatCard detail="Saldo de cuentas corrientes" label="Por cobrar" tone="info" value={formatCurrency(metrics.receivables.openTotal)} />
              <StatCard detail={`${formatNumber(metrics.stock.units)} unidades`} label="Stock valorizado" value={formatCurrency(metrics.stock.value)} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader><CardTitle>Prioridades de hoy</CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {overduePayables.length > 0 ? (
                    <Link className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3" href={`/administration?view=obligations&month=${month}`}>
                      <div><div className="font-bold text-red-900">{overduePayables.length} obligaciones vencidas</div><div className="mt-0.5 text-sm text-red-700">Revisar y programar pagos pendientes.</div></div>
                      <strong className="whitespace-nowrap text-red-900">{formatCurrency(overduePayables.reduce((sum, item) => sum + item.balance, 0))}</strong>
                    </Link>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900"><strong>No hay obligaciones vencidas.</strong></div>
                  )}

                  {dueSoonPayables.length > 0 ? (
                    <Link className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" href={`/administration?view=obligations&month=${month}`}>
                      <div><div className="font-bold text-amber-950">{dueSoonPayables.length} pagos vencen en 7 días</div><div className="mt-0.5 text-sm text-amber-800">Confirmar fondos y fecha de pago.</div></div>
                      <strong className="whitespace-nowrap text-amber-950">{formatCurrency(dueSoonPayables.reduce((sum, item) => sum + item.balance, 0))}</strong>
                    </Link>
                  ) : null}

                  {!profitability.complete ? (
                    <Link className="flex items-center justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3" href={`/administration?view=results&month=${month}`}>
                      <div><div className="font-bold text-sky-950">Rentabilidad todavía parcial</div><div className="mt-0.5 text-sm text-sky-800">{profitability.missingCostSales} ventas no tienen costo comprobable.</div></div>
                      <strong className="whitespace-nowrap text-sky-950">{profitability.costCoveragePercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% cubierto</strong>
                    </Link>
                  ) : null}

                  {!reconciliation.ready ? (
                    <Link className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" href={`/administration?view=treasury&month=${month}`}>
                      <div><div className="font-bold text-slate-900">Conciliación bancaria incompleta</div><div className="mt-0.5 text-sm text-slate-600">{reconciliation.activeAccounts === 0 ? "No hay cuentas bancarias activas." : `${reconciliation.pendingLines + reconciliation.partialLines} movimientos necesitan revisión.`}</div></div>
                      <StatusBadge tone="warning">{reconciliation.coveragePercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%</StatusBadge>
                    </Link>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Liquidez próxima</CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {cashflow.meta.horizons.map((horizon) => (
                    <div className="rounded-xl border border-[#e2e8f0] p-4" key={horizon.days}>
                      <div className="flex items-center justify-between gap-3"><strong>Próximos {horizon.days} días</strong><strong className={horizon.net >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(horizon.net)}</strong></div>
                      <div className="mt-2 flex justify-between text-xs text-[#64748b]"><span>Ingresos {formatCurrency(horizon.inflow)}</span><span>Egresos {formatCurrency(horizon.outflow)}</span></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

          </div>
        ) : null}

        {view === "results" ? (
          <div className="grid gap-5">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard compact detail={percentage(metrics.sales.deltaPercent)} label="Ventas netas" tone="accent" value={formatCurrency(metrics.sales.current)} />
              <StatCard compact detail={`${grossMarginPercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% sobre ventas netas`} label="Margen bruto" tone="success" value={formatCurrency(metrics.margin.grossProfit)} />
              <StatCard compact detail="Gastos del período + RRHH, sin duplicados" label="Costos operativos" tone="warning" value={formatCurrency(metrics.margin.operatingCosts)} />
              <StatCard compact label="Resultado operativo" tone={metrics.margin.operatingResult >= 0 ? "success" : "danger"} value={formatCurrency(metrics.margin.operatingResult)} />
              <StatCard compact detail={`${accumulated.months} meses · desde ${accumulated.startMonth}`} label="Rentabilidad acumulada" tone={accumulated.operatingResult >= 0 ? "success" : "danger"} value={formatCurrency(accumulated.operatingResult)} />
            </div>
            {!profitability.complete ? (
              <ConfidenceNote><strong>Resultado provisional.</strong> Faltan costos en {profitability.missingCostSales} ventas que representan {formatCurrency(profitability.missingCostRevenue)}. La cobertura comprobable es {profitability.costCoveragePercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%.</ConfidenceNote>
            ) : (
              <ConfidenceNote tone="success"><strong>Costo de mercadería completo.</strong> Todas las ventas tienen costo comprobable. El cierre también requiere confirmar gastos y conciliación bancaria.</ConfidenceNote>
            )}
            {canWriteMetrics ? <Card>
              <CardHeader><CardTitle>Agregar costo programado</CardTitle></CardHeader>
              <CardContent>
                <form action={createAdministrationCostAction} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
                  <input name="month" type="hidden" value={month} />
                  <Field className="sm:col-span-2" htmlFor="admin-cost-concept" label="Concepto" required><Input id="admin-cost-concept" name="concept" required /></Field>
                  <Field htmlFor="admin-cost-amount" label="Monto" required><MoneyInput id="admin-cost-amount" min="0.01" name="amount" required /></Field>
                  <Field htmlFor="admin-cost-type" label="Etiqueta" required><Select defaultValue="fijo" id="admin-cost-type" name="costType" required><option value="fijo">Fijo</option><option value="variable">Variable</option><option value="unico">Único</option></Select></Field>
                  <Field htmlFor="admin-cost-start" label="Desde" required><Input className="min-w-0 max-w-full" defaultValue={month} id="admin-cost-start" name="startMonth" required type="month" /></Field>
                  <Field className="xl:col-span-2" htmlFor="admin-cost-duration" label="Duración" required><Select defaultValue="indefinite" id="admin-cost-duration" name="durationMonths" required><option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option><option value="indefinite">Indefinido, confirmar cada mes</option></Select></Field>
                  <Button className="w-full sm:col-span-2 xl:col-span-1" type="submit">Guardar costo</Button>
                </form>
              </CardContent>
            </Card> : null}
            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Costos del período</CardTitle><span className="text-xs text-[#64748b]">Los indefinidos quedan suspendidos al cambiar de mes hasta confirmarlos.</span></div></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div><p className="text-sm text-[#64748b]">Gastos incluidos</p><strong className="tabular-nums">{formatCurrency(metrics.margin.scheduledCosts)}</strong></div>
                <div><p className="text-sm text-[#64748b]">Sueldos, aguinaldo y cargas · RRHH</p><strong className="tabular-nums">{formatCurrency(metrics.margin.payrollCosts)}</strong></div>
                <div><p className="text-sm text-[#64748b]">Total operativo</p><strong className="tabular-nums">{formatCurrency(metrics.margin.operatingCosts)}</strong></div>
                {payrollDuplicates.length ? <p className="sm:col-span-3 text-sm text-amber-800">{payrollDuplicates.length} registros manuales de sueldo coinciden en nombre e importe con RRHH. Se conservan para consulta y se cuentan una sola vez desde RRHH.</p> : null}
              </CardContent>
              <DataTable caption="Costos operativos programados" className="rounded-none border-0 shadow-none" minWidth="1050px" tableLabel="Costos programados">
                <DataTableHeader><DataTableRow><DataTableHead>Concepto</DataTableHead><DataTableHead>Etiqueta</DataTableHead><DataTableHead>Vigencia</DataTableHead><DataTableHead>Estado</DataTableHead><DataTableHead align="right">Monto</DataTableHead><DataTableHead align="center">Acciones</DataTableHead></DataTableRow></DataTableHeader>
                <DataTableBody>
                  {operatingCosts.length === 0 ? <DataTableRow><DataTableCell className="py-8 text-center text-[#64748b]" colSpan={6}>No hay costos configurados para este período.</DataTableCell></DataTableRow> : operatingCosts.map((cost) => {
                    const duration = cost.durationMonths === null ? "Indefinido" : cost.durationMonths === 1 ? "1 mes" : `${cost.durationMonths} meses`;
                    return (
                      <DataTableRow className={cost.included ? "" : "bg-[#f8fafc] text-[#94a3b8]"} key={cost.id}>
                        <DataTableCell className="font-bold">{cost.concept}</DataTableCell>
                        <DataTableCell><StatusBadge tone={cost.costType === "fijo" ? "accent" : cost.costType === "variable" ? "warning" : "neutral"}>{cost.costType === "unico" ? "Único" : cost.costType === "fijo" ? "Fijo" : "Variable"}</StatusBadge></DataTableCell>
                        <DataTableCell>Desde {cost.startMonth} · {duration}</DataTableCell>
                        <DataTableCell><StatusBadge tone={cost.included ? "success" : "neutral"}>{cost.payrollEmployee ? "Contado en RRHH" : cost.included ? "Incluido" : "Suspendido"}</StatusBadge></DataTableCell>
                        <DataTableCell align="right" className="font-mono font-bold">{formatCurrency(cost.amount)}</DataTableCell>
                        <DataTableCell align="center">
                          {canWriteMetrics ? <div className="flex flex-wrap justify-center gap-2">
                            {!cost.payrollEmployee ? <form action={setAdministrationCostMonthAction}><input name="id" type="hidden" value={cost.id} /><input name="month" type="hidden" value={month} /><input name="included" type="hidden" value={String(!cost.included)} /><Button size="sm" type="submit" variant="secondary">{cost.included ? "Suspender" : "Incluir"}</Button></form> : null}
                            <TableHoverActionMenu label={`Editar ${cost.concept}`} width={360}>
                              <form action={updateAdministrationCostAction} className="grid gap-2">
                                <input name="id" type="hidden" value={cost.id} /><input name="month" type="hidden" value={month} />
                                <Field htmlFor={`cost-${cost.id}-concept`} label="Concepto"><Input defaultValue={cost.concept} id={`cost-${cost.id}-concept`} name="concept" required /></Field>
                                <Field htmlFor={`cost-${cost.id}-amount`} label="Monto"><MoneyInput defaultValue={cost.amount} id={`cost-${cost.id}-amount`} min="0.01" name="amount" required /></Field>
                                <div className="grid grid-cols-2 gap-2"><Field htmlFor={`cost-${cost.id}-type`} label="Etiqueta"><Select defaultValue={cost.costType} id={`cost-${cost.id}-type`} name="costType"><option value="fijo">Fijo</option><option value="variable">Variable</option><option value="unico">Único</option></Select></Field><Field htmlFor={`cost-${cost.id}-start`} label="Desde"><Input defaultValue={cost.startMonth} id={`cost-${cost.id}-start`} name="startMonth" type="month" /></Field></div>
                                <Field htmlFor={`cost-${cost.id}-duration`} label="Duración"><Select defaultValue={cost.durationMonths === null ? "indefinite" : String(cost.durationMonths)} id={`cost-${cost.id}-duration`} name="durationMonths"><option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option><option value="indefinite">Indefinido</option></Select></Field>
                                <Button className="w-full" size="sm" type="submit">Guardar cambios</Button>
                              </form>
                              <form action={archiveAdministrationCostAction} className="mt-2"><input name="id" type="hidden" value={cost.id} /><input name="month" type="hidden" value={month} /><Button className="w-full text-red-700" size="sm" type="submit" variant="secondary">Archivar</Button></form>
                            </TableHoverActionMenu>
                          </div> : <span className="text-xs text-[#94a3b8]">Solo lectura</span>}
                        </DataTableCell>
                      </DataTableRow>
                    );
                  })}
                </DataTableBody>
              </DataTable>
            </Card>
            <Card>
              <CardHeader><CardTitle>Resultado gerencial del período</CardTitle></CardHeader>
              <DataTable caption="Resultado económico del período" className="rounded-none border-0 shadow-none" tableLabel="Resultado económico">
                <DataTableBody>
                  {[
                    ["Ventas brutas entregadas", metrics.sales.grossCurrent],
                    ["Ventas netas", metrics.sales.current],
                    ["Costo de mercadería vendida", -metrics.margin.grossCost],
                    ["Margen bruto", metrics.margin.grossProfit],
                    ["Gastos operativos incluidos", -metrics.margin.scheduledCosts],
                    ["Sueldos, aguinaldo y cargas (RRHH)", -metrics.margin.payrollCosts],
                    ["Resultado operativo", metrics.margin.operatingResult],
                  ].map(([label, amount], index) => (
                    <DataTableRow className={index === 3 || index === 6 ? "bg-[#f8fafc] font-bold" : ""} key={String(label)}><DataTableCell>{label}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(Number(amount))}</DataTableCell></DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </Card>
            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Condiciones de cierre</CardTitle><StatusBadge tone={closeReady ? "success" : "warning"}>{closeReady ? "Listo para cerrar" : "Cierre bloqueado"}</StatusBadge></div></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {closeChecks.map((check) => (
                  <div className={cn("rounded-xl border p-4", check.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")} key={check.label}>
                    <div className="flex items-center justify-between gap-3"><strong>{check.label}</strong><StatusBadge tone={check.ready ? "success" : "warning"}>{check.ready ? "OK" : "Revisar"}</StatusBadge></div>
                    <p className="mt-2 text-xs text-[#64748b]">{check.detail}</p>
                  </div>
                ))}
                {closure ? (
                  <div className="md:col-span-3 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div><strong className="text-emerald-950">Período cerrado · versión {closure.version}</strong><p className="mt-1 text-xs text-emerald-800">Cerrado por {closure.closedByUsername || "administración"} el {formatDate(closure.closedAt)}. La fotografía queda preservada aunque luego se reabra.</p></div>
                    {canClosePeriods ? <form action={reopenAdministrationMonthAction} className="flex flex-wrap items-end gap-2"><input name="month" type="hidden" value={month} /><Field htmlFor="admin-reopen-reason" label="Motivo de reapertura" required><Input id="admin-reopen-reason" minLength={5} name="reason" required /></Field><Button type="submit" variant="secondary">Reabrir período</Button></form> : null}
                  </div>
                ) : closeReady && canClosePeriods ? (
                  <form action={closeAdministrationMonthAction} className="md:col-span-3 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                    <input name="month" type="hidden" value={month} />
                    <div><strong className="text-sky-950">Crear cierre gerencial</strong><p className="mt-1 text-xs text-sky-800">Guarda una fotografía versionada del resultado, caja, créditos, stock, obligaciones y evidencias del período.</p></div>
                    <div className="flex flex-wrap items-end gap-2"><Field htmlFor="admin-close-notes" label="Nota opcional"><Input id="admin-close-notes" name="notes" /></Field><Button type="submit">Cerrar {periodLabel(period)}</Button></div>
                  </form>
                ) : (
                  <p className="md:col-span-3 text-xs text-[#64748b]">El cierre se habilita cuando todas las fuentes estén completas. Hasta entonces los valores siguen siendo operativos y pueden cambiar.</p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {view === "treasury" ? (
          <TreasuryWorkspace
            treasury={treasury}
            cashflow={cashflow}
            reconciliation={reconciliation}
            reconciliationWorkspace={reconciliationWorkspace}
            canWriteTreasury={canWriteTreasury}
            month={month}
            today={today}
            period={period}
          />
        ) : null}

        {view === "obligations" ? (
          <div className="grid gap-5">
            {canWritePayables ? <Card>
              <CardHeader><CardTitle>Registrar obligación manual</CardTitle></CardHeader>
              <CardContent>
                <form action={createAdministrationPayableAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_180px_auto] xl:items-end">
                  <input name="month" type="hidden" value={month} />
                  <Field htmlFor="admin-payable-concept" label="Concepto o beneficiario" required><Input id="admin-payable-concept" name="concept" required /></Field>
                  <Field htmlFor="admin-payable-amount" label="Monto" required><MoneyInput id="admin-payable-amount" min="0.01" name="amount" required /></Field>
                  <Field htmlFor="admin-payable-date" label="Vencimiento" required><Input defaultValue={today} id="admin-payable-date" name="date" required type="date" /></Field>
                  <Button type="submit">Agregar obligación</Button>
                </form>
              </CardContent>
            </Card> : null}
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard detail={`${payables.meta.count} registros`} label="Total pendiente" tone="warning" value={formatCurrency(payables.meta.total)} />
              <StatCard detail={`${overduePayables.length} obligaciones`} label="Vencido" tone={overduePayables.length > 0 ? "danger" : "success"} value={formatCurrency(overduePayables.reduce((sum, item) => sum + item.balance, 0))} />
              <StatCard detail={`${dueSoonPayables.length} obligaciones`} label="Próximos 7 días" tone="info" value={formatCurrency(dueSoonPayables.reduce((sum, item) => sum + item.balance, 0))} />
            </div>
            <Card>
              <CardHeader><CardTitle>Agenda unificada de pagos</CardTitle></CardHeader>
              <DataTable caption="Obligaciones pendientes ordenadas por vencimiento" className="rounded-none border-0 shadow-none" minWidth="1080px" tableLabel="Agenda de obligaciones">
                <DataTableHeader><DataTableRow><DataTableHead>Vencimiento</DataTableHead><DataTableHead>Tipo</DataTableHead><DataTableHead>Beneficiario</DataTableHead><DataTableHead>Concepto</DataTableHead><DataTableHead>Estado</DataTableHead><DataTableHead align="right">Saldo</DataTableHead><DataTableHead align="center">Acciones</DataTableHead></DataTableRow></DataTableHeader>
                <DataTableBody>
                  {payables.data.map((item) => {
                    const days = daysFromToday(item.date, today);
                    const tone = days < 0 ? "danger" : days <= 7 ? "warning" : "neutral";
                    return <DataTableRow key={`${item.source}-${item.id}`}><DataTableCell className="whitespace-nowrap">{formatDate(item.date)}</DataTableCell><DataTableCell>{sourceLabel(item.source)}</DataTableCell><DataTableCell className="font-medium">{item.provider}</DataTableCell><DataTableCell>{item.concept}</DataTableCell><DataTableCell><StatusBadge tone={tone}>{days < 0 ? "Vencido" : days <= 7 ? "Próximo" : item.status}</StatusBadge></DataTableCell><DataTableCell align="right" className="whitespace-nowrap font-mono">{formatCurrency(item.balance)}</DataTableCell><DataTableCell align="center">{canWritePayables && item.source === "compra" && item.balance > item.scheduledAmount ? <TableHoverActionMenu label={`Programar pago de ${item.provider}`} width={330}><form action={scheduleAdministrationSupplierPaymentAction} className="grid gap-2"><input name="id" type="hidden" value={item.id} /><input name="month" type="hidden" value={month} /><input name="notes" type="hidden" value="Programado desde Administración V2" /><Field htmlFor={`admin-payable-${item.id}-amount`} label="Monto"><MoneyInput defaultValue={Math.round(item.balance - item.scheduledAmount)} id={`admin-payable-${item.id}-amount`} min="0.01" name="amount" required /></Field><Field htmlFor={`admin-payable-${item.id}-date`} label="Fecha"><Input defaultValue={item.scheduledDate ?? today} id={`admin-payable-${item.id}-date`} name="date" required type="date" /></Field><Button className="w-full" size="sm" type="submit">Programar pago</Button></form></TableHoverActionMenu> : <span className="text-xs text-[#94a3b8]">—</span>}</DataTableCell></DataTableRow>;
                  })}
                </DataTableBody>
              </DataTable>
            </Card>
          </div>
        ) : null}

        {view === "equity" ? (
          <div className="grid gap-5">
            <ConfidenceNote><strong>Estimación patrimonial operativa.</strong> No es una valuación comercial ni un balance contable. Falta incorporar conciliación bancaria, impuestos y otros pasivos no registrados antes de certificarla.</ConfidenceNote>
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard detail="Caja + cuentas por cobrar + stock" label="Activos observables" tone="accent" value={formatCurrency(assets)} />
              <StatCard detail={`${payables.meta.count} obligaciones registradas`} label="Pasivos observables" tone="warning" value={formatCurrency(liabilities)} />
              <StatCard detail="Activos menos pasivos registrados" label="Patrimonio neto estimado" tone={netEquity >= 0 ? "success" : "danger"} value={formatCurrency(netEquity)} />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Activos observables</CardTitle></CardHeader>
                <DataTable caption="Composición de activos" className="rounded-none border-0 shadow-none" tableLabel="Activos observables"><DataTableBody>
                  {[["Caja operativa", treasury.meta.total], ["Cuentas por cobrar", metrics.receivables.openTotal], ["Stock valorizado", metrics.stock.value], ["Total activos", assets]].map(([label, amount], index) => (
                    <DataTableRow className={index === 3 ? "bg-[#f8fafc] font-bold" : ""} key={String(label)}><DataTableCell>{label}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(Number(amount))}</DataTableCell></DataTableRow>
                  ))}
                </DataTableBody></DataTable>
              </Card>
              <Card>
                <CardHeader><CardTitle>Pasivos observables</CardTitle></CardHeader>
                <DataTable caption="Composición de pasivos" className="rounded-none border-0 shadow-none" tableLabel="Pasivos observables"><DataTableBody>
                  {Object.entries(payables.data.reduce<Record<string, number>>((groups, item) => { const label = sourceLabel(item.source); groups[label] = (groups[label] ?? 0) + item.balance; return groups; }, {})).map(([label, amount]) => (
                    <DataTableRow key={label}><DataTableCell>{label}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(amount)}</DataTableCell></DataTableRow>
                  ))}
                  <DataTableRow className="bg-[#f8fafc] font-bold"><DataTableCell>Total pasivos</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(liabilities)}</DataTableCell></DataTableRow>
                </DataTableBody></DataTable>
              </Card>
            </div>
          </div>
        ) : null}

      </div>
    </ModulePage>
  );
}
