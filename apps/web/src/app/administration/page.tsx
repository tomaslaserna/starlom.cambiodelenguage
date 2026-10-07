import Link from "next/link";
import type { ReactNode } from "react";
import { ModulePage } from "@/components/module-page";
import { getAdministrationMonthClosure } from "@/lib/administration-closure";
import { getAdministrationDataCoupling } from "@/lib/administration-data";
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
  ADMIN_BALANCE_READ_PERMISSION,
  ADMIN_METRICS_READ_PERMISSION,
  ADMIN_TREASURY_READ_PERMISSION,
} from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import {
  archiveAdministrationCostAction,
  closeAdministrationMonthAction,
  createAdministrationBankAccountAction,
  createAdministrationCostAction,
  createAdministrationMovementAction,
  createAdministrationPayableAction,
  createAdministrationStatementLineAction,
  ignoreAdministrationStatementLineAction,
  matchAdministrationStatementLineAction,
  reopenAdministrationMonthAction,
  scheduleAdministrationSupplierPaymentAction,
  setAdministrationCostMonthAction,
  updateAdministrationCostAction,
} from "./actions";
import { AdministrationDemo } from "./administration-demo";

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

  const [dashboard, treasury, payables, cashflow, profitability, operatingCosts, accumulated, reconciliation, closure, dataCoupling, reconciliationWorkspace] = await Promise.all([
    getBalanceDashboard(session.companyId, period),
    getTreasuryBalances(session.companyId),
    getAccountsPayable(session.companyId),
    getCashflow(session.companyId),
    getBreakEvenStatus(session.companyId, month),
    listScheduledOperatingCosts(session.companyId, month),
    getAccumulatedOperatingResult(session.companyId, month),
    getBankReconciliationSummary(session.companyId, period),
    getAdministrationMonthClosure(session.companyId, month),
    getAdministrationDataCoupling(session.companyId),
    getBankReconciliationWorkspace(session.companyId, period),
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
  const suspendedIndefiniteCosts = operatingCosts.filter((cost) => cost.durationMonths === null && !cost.included);
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
          <form action="/administration" className="flex items-end gap-2">
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
              <StatCard detail="Construido desde cobros, pagos y movimientos" label="Caja operativa" tone="accent" value={formatCurrency(treasury.meta.total)} />
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

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Acoplamiento histórico</CardTitle>
                    <p className="mt-1 text-sm text-[#64748b]">Estas fuentes ya alimentan Administración sin duplicar ni migrar movimientos.</p>
                  </div>
                  <StatusBadge tone={dataCoupling.missingRequiredSources === 0 ? "success" : "warning"}>
                    {dataCoupling.missingRequiredSources === 0 ? "Fuentes esenciales conectadas" : `${dataCoupling.missingRequiredSources} fuentes sin historia`}
                  </StatusBadge>
                </div>
              </CardHeader>
              <DataTable caption="Fuentes históricas utilizadas por Administración" className="rounded-none border-0 shadow-none" minWidth="860px" tableLabel="Acoplamiento histórico">
                <DataTableHeader><DataTableRow><DataTableHead>Fuente</DataTableHead><DataTableHead>Uso administrativo</DataTableHead><DataTableHead>Integración</DataTableHead><DataTableHead>Período disponible</DataTableHead><DataTableHead align="right">Registros</DataTableHead></DataTableRow></DataTableHeader>
                <DataTableBody>
                  {dataCoupling.sources.map((source) => (
                    <DataTableRow key={source.key}>
                      <DataTableCell className="font-medium">{source.label}</DataTableCell>
                      <DataTableCell>{source.purpose}</DataTableCell>
                      <DataTableCell><StatusBadge tone={source.count > 0 || !source.required ? "success" : "warning"}>{source.mode === "automatic" ? "Automática" : "Carga administrativa"}</StatusBadge></DataTableCell>
                      <DataTableCell className="whitespace-nowrap">{source.firstDate ? `${formatDate(source.firstDate)} — ${formatDate(source.lastDate)}` : "Sin movimientos"}</DataTableCell>
                      <DataTableCell align="right" className="font-mono">{formatNumber(source.count)}</DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </Card>
          </div>
        ) : null}

        {view === "results" ? (
          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <StatCard detail={percentage(metrics.sales.deltaPercent)} label="Ventas netas" tone="accent" value={formatCurrency(metrics.sales.current)} />
              <StatCard detail={`${grossMarginPercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}% sobre ventas netas`} label="Margen bruto" tone="success" value={formatCurrency(metrics.margin.grossProfit)} />
              <StatCard label="Costos operativos" tone="warning" value={formatCurrency(metrics.margin.operatingCosts)} />
              <StatCard label="Resultado operativo" tone={metrics.margin.operatingResult >= 0 ? "success" : "danger"} value={formatCurrency(metrics.margin.operatingResult)} />
              <StatCard detail={`${accumulated.months} meses · desde ${accumulated.startMonth}`} label="Rentabilidad acumulada" tone={accumulated.operatingResult >= 0 ? "success" : "danger"} value={formatCurrency(accumulated.operatingResult)} />
            </div>
            {!profitability.complete ? (
              <ConfidenceNote><strong>Resultado provisional.</strong> Faltan costos en {profitability.missingCostSales} ventas que representan {formatCurrency(profitability.missingCostRevenue)}. La cobertura comprobable es {profitability.costCoveragePercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%.</ConfidenceNote>
            ) : (
              <ConfidenceNote tone="success"><strong>Costos completos.</strong> El resultado del período puede utilizarse para el cierre gerencial.</ConfidenceNote>
            )}
            <Card>
              <CardHeader><CardTitle>Agregar costo programado</CardTitle></CardHeader>
              <CardContent>
                <form action={createAdministrationCostAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_160px_150px_150px_180px_auto] xl:items-end">
                  <input name="month" type="hidden" value={month} />
                  <Field htmlFor="admin-cost-concept" label="Concepto" required><Input id="admin-cost-concept" name="concept" required /></Field>
                  <Field htmlFor="admin-cost-amount" label="Monto" required><Input id="admin-cost-amount" min="0.01" name="amount" required step="0.01" type="number" /></Field>
                  <Field htmlFor="admin-cost-type" label="Etiqueta" required><Select defaultValue="fijo" id="admin-cost-type" name="costType" required><option value="fijo">Fijo</option><option value="variable">Variable</option><option value="unico">Único</option></Select></Field>
                  <Field htmlFor="admin-cost-start" label="Desde" required><Input defaultValue={month} id="admin-cost-start" name="startMonth" required type="month" /></Field>
                  <Field htmlFor="admin-cost-duration" label="Duración" required><Select defaultValue="indefinite" id="admin-cost-duration" name="durationMonths" required><option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option><option value="indefinite">Indefinido, confirmar cada mes</option></Select></Field>
                  <Button type="submit">Guardar costo</Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Costos del período</CardTitle><span className="text-xs text-[#64748b]">Los indefinidos quedan suspendidos al cambiar de mes hasta confirmarlos.</span></div></CardHeader>
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
                        <DataTableCell><StatusBadge tone={cost.included ? "success" : "neutral"}>{cost.included ? "Incluido" : "Suspendido"}</StatusBadge></DataTableCell>
                        <DataTableCell align="right" className="font-mono font-bold">{formatCurrency(cost.amount)}</DataTableCell>
                        <DataTableCell align="center">
                          <div className="flex justify-center gap-2">
                            <form action={setAdministrationCostMonthAction}><input name="id" type="hidden" value={cost.id} /><input name="month" type="hidden" value={month} /><input name="included" type="hidden" value={String(!cost.included)} /><Button size="sm" type="submit" variant="secondary">{cost.included ? "Suspender" : "Incluir"}</Button></form>
                            <TableHoverActionMenu label={`Editar ${cost.concept}`} width={360}>
                              <form action={updateAdministrationCostAction} className="grid gap-2">
                                <input name="id" type="hidden" value={cost.id} /><input name="month" type="hidden" value={month} />
                                <Field htmlFor={`cost-${cost.id}-concept`} label="Concepto"><Input defaultValue={cost.concept} id={`cost-${cost.id}-concept`} name="concept" required /></Field>
                                <Field htmlFor={`cost-${cost.id}-amount`} label="Monto"><Input defaultValue={cost.amount} id={`cost-${cost.id}-amount`} min="0.01" name="amount" required step="0.01" type="number" /></Field>
                                <div className="grid grid-cols-2 gap-2"><Field htmlFor={`cost-${cost.id}-type`} label="Etiqueta"><Select defaultValue={cost.costType} id={`cost-${cost.id}-type`} name="costType"><option value="fijo">Fijo</option><option value="variable">Variable</option><option value="unico">Único</option></Select></Field><Field htmlFor={`cost-${cost.id}-start`} label="Desde"><Input defaultValue={cost.startMonth} id={`cost-${cost.id}-start`} name="startMonth" type="month" /></Field></div>
                                <Field htmlFor={`cost-${cost.id}-duration`} label="Duración"><Select defaultValue={cost.durationMonths === null ? "indefinite" : String(cost.durationMonths)} id={`cost-${cost.id}-duration`} name="durationMonths"><option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option><option value="indefinite">Indefinido</option></Select></Field>
                                <Button className="w-full" size="sm" type="submit">Guardar cambios</Button>
                              </form>
                              <form action={archiveAdministrationCostAction} className="mt-2"><input name="id" type="hidden" value={cost.id} /><input name="month" type="hidden" value={month} /><Button className="w-full text-red-700" size="sm" type="submit" variant="secondary">Archivar</Button></form>
                            </TableHoverActionMenu>
                          </div>
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
                    ["Costos operativos y sueldos", -metrics.margin.operatingCosts],
                    ["Resultado operativo", metrics.margin.operatingResult],
                  ].map(([label, amount], index) => (
                    <DataTableRow className={index === 3 || index === 5 ? "bg-[#f8fafc] font-bold" : ""} key={String(label)}><DataTableCell>{label}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(Number(amount))}</DataTableCell></DataTableRow>
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
                    <form action={reopenAdministrationMonthAction} className="flex flex-wrap items-end gap-2"><input name="month" type="hidden" value={month} /><Field htmlFor="admin-reopen-reason" label="Motivo de reapertura" required><Input id="admin-reopen-reason" minLength={5} name="reason" required /></Field><Button type="submit" variant="secondary">Reabrir período</Button></form>
                  </div>
                ) : closeReady ? (
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
          <div className="grid gap-5">
            <ConfidenceNote tone={reconciliation.ready ? "success" : reconciliation.importedLines > 0 ? "info" : "warning"}><strong>{reconciliation.ready ? "Período bancario conciliado." : "Caja operativa, aún no certificada."}</strong> {reconciliation.ready ? "Los movimientos importados del período no tienen diferencias pendientes." : reconciliation.importedLines > 0 ? `Hay ${reconciliation.pendingLines + reconciliation.partialLines} movimientos pendientes o parciales por ${formatCurrency(reconciliation.unmatchedAmount)}.` : "No hay extractos importados para este período; el saldo surge de cobros, pagos y movimientos internos."}</ConfidenceNote>
            <Card>
              <CardHeader><CardTitle>Registrar movimiento manual</CardTitle></CardHeader>
              <CardContent>
                <form action={createAdministrationMovementAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[150px_minmax(220px,1fr)_160px_170px_minmax(180px,1fr)_auto] xl:items-end">
                  <input name="month" type="hidden" value={month} />
                  <Field htmlFor="admin-movement-direction" label="Tipo"><Select defaultValue="salida" id="admin-movement-direction" name="direction"><option value="entrada">Entrada</option><option value="salida">Salida</option></Select></Field>
                  <Field htmlFor="admin-movement-concept" label="Concepto" required><Input id="admin-movement-concept" name="concept" required /></Field>
                  <Field htmlFor="admin-movement-amount" label="Monto" required><Input id="admin-movement-amount" min="0.01" name="amount" required step="0.01" type="number" /></Field>
                  <Field htmlFor="admin-movement-date" label="Fecha" required><Input defaultValue={today} id="admin-movement-date" name="date" required type="date" /></Field>
                  <Field htmlFor="admin-movement-notes" label="Notas"><Input id="admin-movement-notes" name="notes" /></Field>
                  <Button type="submit">Registrar</Button>
                </form>
              </CardContent>
            </Card>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total operativo" tone="accent" value={formatCurrency(treasury.meta.total)} />
              <StatCard label="Efectivo" tone="success" value={formatCurrency(treasury.meta.cash)} />
              <StatCard label="Bancos" tone="info" value={formatCurrency(treasury.meta.bank)} />
              <StatCard label="Otras cuentas" value={formatCurrency(treasury.meta.other)} />
            </div>
            <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Estado de conciliación · {periodLabel(period)}</CardTitle><StatusBadge tone={reconciliation.ready ? "success" : "warning"}>{reconciliation.ready ? "Conciliado" : "Pendiente"}</StatusBadge></div></CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard detail={`${reconciliation.activeAccounts} cuentas activas`} label="Líneas importadas" value={formatNumber(reconciliation.importedLines)} />
                  <StatCard detail={`${reconciliation.matchedLines} líneas completas`} label="Cobertura conciliada" tone={reconciliation.ready ? "success" : "info"} value={`${reconciliation.coveragePercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`} />
                  <StatCard detail={`${reconciliation.partialLines} parciales · ${reconciliation.pendingLines} pendientes`} label="Movimientos a revisar" tone={reconciliation.pendingLines + reconciliation.partialLines > 0 ? "warning" : "success"} value={formatNumber(reconciliation.pendingLines + reconciliation.partialLines)} />
                  <StatCard detail={`Sobre ${formatCurrency(reconciliation.statementAmount)}`} label="Importe sin conciliar" tone={reconciliation.unmatchedAmount > 0 ? "danger" : "success"} value={formatCurrency(reconciliation.unmatchedAmount)} />
                </div>
              </CardContent>
            </Card>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Agregar cuenta bancaria</CardTitle></CardHeader>
                <CardContent>
                  <form action={createAdministrationBankAccountAction} className="grid gap-3 sm:grid-cols-2">
                    <input name="month" type="hidden" value={month} />
                    <Field htmlFor="admin-bank-name" label="Nombre visible" required><Input id="admin-bank-name" name="name" placeholder="Santander principal" required /></Field>
                    <Field htmlFor="admin-bank-bank" label="Banco"><Input id="admin-bank-bank" name="bank" placeholder="Santander" /></Field>
                    <Field htmlFor="admin-bank-currency" label="Moneda"><Select defaultValue="ARS" id="admin-bank-currency" name="currency"><option value="ARS">ARS</option><option value="USD">USD</option></Select></Field>
                    <div className="flex items-end"><Button className="w-full" type="submit">Guardar cuenta</Button></div>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Cargar movimiento de extracto</CardTitle></CardHeader>
                <CardContent>
                  {reconciliationWorkspace.accounts.length === 0 ? (
                    <p className="text-sm text-[#64748b]">Primero agregá una cuenta bancaria.</p>
                  ) : (
                    <form action={createAdministrationStatementLineAction} className="grid gap-3 sm:grid-cols-2">
                      <input name="month" type="hidden" value={month} />
                      <Field htmlFor="admin-statement-account" label="Cuenta" required><Select id="admin-statement-account" name="accountId" required>{reconciliationWorkspace.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</Select></Field>
                      <Field htmlFor="admin-statement-date" label="Fecha" required><Input defaultValue={today} id="admin-statement-date" name="date" required type="date" /></Field>
                      <Field htmlFor="admin-statement-type" label="Movimiento" required><Select defaultValue="credit" id="admin-statement-type" name="movementType" required><option value="credit">Ingreso / crédito</option><option value="debit">Egreso / débito</option></Select></Field>
                      <Field htmlFor="admin-statement-amount" label="Importe" required><Input id="admin-statement-amount" min="0.01" name="amount" required step="0.01" type="number" /></Field>
                      <Field htmlFor="admin-statement-description" label="Descripción" required><Input id="admin-statement-description" name="description" required /></Field>
                      <Field htmlFor="admin-statement-reference" label="Referencia"><Input id="admin-statement-reference" name="reference" /></Field>
                      <div className="sm:col-span-2"><Button className="w-full" type="submit">Agregar al extracto</Button></div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><CardTitle>Conciliación movimiento por movimiento</CardTitle><p className="mt-1 text-sm text-[#64748b]">El extracto certifica la caja; nunca genera ni modifica cobros o pagos.</p></div>
                  <StatusBadge tone="info">{reconciliationWorkspace.candidates.length} movimientos internos disponibles</StatusBadge>
                </div>
              </CardHeader>
              <DataTable caption="Movimientos bancarios y su conciliación" className="rounded-none border-0 shadow-none" minWidth="1120px" tableLabel="Conciliación bancaria">
                <DataTableHeader><DataTableRow><DataTableHead>Fecha</DataTableHead><DataTableHead>Cuenta / detalle</DataTableHead><DataTableHead>Referencia</DataTableHead><DataTableHead>Estado</DataTableHead><DataTableHead align="right">Extracto</DataTableHead><DataTableHead align="right">Pendiente</DataTableHead><DataTableHead align="center">Acciones</DataTableHead></DataTableRow></DataTableHeader>
                <DataTableBody>
                  {reconciliationWorkspace.lines.length === 0 ? (
                    <DataTableRow><DataTableCell className="py-8 text-center text-[#64748b]" colSpan={7}>Todavía no hay movimientos de extracto en este período.</DataTableCell></DataTableRow>
                  ) : reconciliationWorkspace.lines.map((line) => {
                    const open = line.status === "pending" || line.status === "partial";
                    return (
                      <DataTableRow key={line.id}>
                        <DataTableCell className="whitespace-nowrap">{formatDate(line.date)}</DataTableCell>
                        <DataTableCell><strong>{line.accountName}</strong><div className="mt-0.5 text-xs text-[#64748b]">{line.description}</div></DataTableCell>
                        <DataTableCell>{line.reference || "—"}</DataTableCell>
                        <DataTableCell><StatusBadge tone={line.status === "matched" ? "success" : line.status === "ignored" ? "neutral" : "warning"}>{line.status}</StatusBadge></DataTableCell>
                        <DataTableCell align="right" className={cn("whitespace-nowrap font-mono", line.amount < 0 ? "text-red-700" : "text-emerald-700")}>{formatCurrency(line.amount)}</DataTableCell>
                        <DataTableCell align="right" className="whitespace-nowrap font-mono">{formatCurrency(line.remainingAmount)}</DataTableCell>
                        <DataTableCell align="center">
                          {open ? (
                            <TableHoverActionMenu label={`Conciliar ${line.description}`} width={390}>
                              <div className="grid gap-4">
                                <form action={matchAdministrationStatementLineAction} className="grid gap-2">
                                  <input name="lineId" type="hidden" value={line.id} /><input name="month" type="hidden" value={month} />
                                  <Field htmlFor={`admin-match-${line.id}-payment`} label="Cobro o pago registrado"><Select id={`admin-match-${line.id}-payment`} name="paymentId" required><option value="">Seleccionar movimiento</option>{reconciliationWorkspace.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{formatDate(candidate.date)} · {candidate.entityName} · {formatCurrency(candidate.remainingAmount)}</option>)}</Select></Field>
                                  <Field htmlFor={`admin-match-${line.id}-amount`} label="Importe a conciliar"><Input defaultValue={line.remainingAmount} id={`admin-match-${line.id}-amount`} max={line.remainingAmount} min="0.01" name="amount" required step="0.01" type="number" /></Field>
                                  <Field htmlFor={`admin-match-${line.id}-notes`} label="Nota"><Input id={`admin-match-${line.id}-notes`} name="notes" /></Field>
                                  <Button className="w-full" disabled={reconciliationWorkspace.candidates.length === 0} size="sm" type="submit">Confirmar cruce</Button>
                                </form>
                                {line.status === "pending" ? <form action={ignoreAdministrationStatementLineAction} className="grid gap-2 border-t border-[#e2e8f0] pt-3"><input name="lineId" type="hidden" value={line.id} /><input name="month" type="hidden" value={month} /><Field htmlFor={`admin-ignore-${line.id}`} label="Excluir con motivo"><Input id={`admin-ignore-${line.id}`} name="reason" placeholder="Ej.: transferencia entre cuentas propias" required /></Field><Button className="w-full" size="sm" type="submit" variant="secondary">No corresponde conciliar</Button></form> : null}
                              </div>
                            </TableHoverActionMenu>
                          ) : <span className="text-xs text-[#94a3b8]">—</span>}
                        </DataTableCell>
                      </DataTableRow>
                    );
                  })}
                </DataTableBody>
              </DataTable>
            </Card>
            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Saldos por cuenta</CardTitle></CardHeader>
                <DataTable caption="Saldos operativos por cuenta" className="rounded-none border-0 shadow-none" tableLabel="Saldos por cuenta">
                  <DataTableHeader><DataTableRow><DataTableHead>Cuenta</DataTableHead><DataTableHead>Tipo</DataTableHead><DataTableHead align="right">Saldo</DataTableHead></DataTableRow></DataTableHeader>
                  <DataTableBody>
                    {treasury.accounts.map((account) => (
                      <DataTableRow key={`${account.accountType}-${account.account}`}><DataTableCell><strong>{account.account}</strong><div className="text-xs text-[#64748b]">{account.movements} movimientos</div></DataTableCell><DataTableCell>{account.accountType}</DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(account.balance)}</DataTableCell></DataTableRow>
                    ))}
                  </DataTableBody>
                </DataTable>
              </Card>
              <Card>
                <CardHeader><CardTitle>Proyección a 30 días</CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {cashflow.meta.horizons.map((horizon) => (
                    <div className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-[#e2e8f0] p-4" key={horizon.days}><div><strong>{horizon.days} días</strong><div className="mt-1 text-xs text-[#64748b]">Entra {formatCurrency(horizon.inflow)} · Sale {formatCurrency(horizon.outflow)}</div></div><strong className={horizon.net >= 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(horizon.net)}</strong></div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {view === "obligations" ? (
          <div className="grid gap-5">
            <Card>
              <CardHeader><CardTitle>Registrar obligación manual</CardTitle></CardHeader>
              <CardContent>
                <form action={createAdministrationPayableAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_180px_auto] xl:items-end">
                  <input name="month" type="hidden" value={month} />
                  <Field htmlFor="admin-payable-concept" label="Concepto o beneficiario" required><Input id="admin-payable-concept" name="concept" required /></Field>
                  <Field htmlFor="admin-payable-amount" label="Monto" required><Input id="admin-payable-amount" min="0.01" name="amount" required step="0.01" type="number" /></Field>
                  <Field htmlFor="admin-payable-date" label="Vencimiento" required><Input defaultValue={today} id="admin-payable-date" name="date" required type="date" /></Field>
                  <Button type="submit">Agregar obligación</Button>
                </form>
              </CardContent>
            </Card>
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
                    return <DataTableRow key={`${item.source}-${item.id}`}><DataTableCell className="whitespace-nowrap">{formatDate(item.date)}</DataTableCell><DataTableCell>{sourceLabel(item.source)}</DataTableCell><DataTableCell className="font-medium">{item.provider}</DataTableCell><DataTableCell>{item.concept}</DataTableCell><DataTableCell><StatusBadge tone={tone}>{days < 0 ? "Vencido" : days <= 7 ? "Próximo" : item.status}</StatusBadge></DataTableCell><DataTableCell align="right" className="whitespace-nowrap font-mono">{formatCurrency(item.balance)}</DataTableCell><DataTableCell align="center">{item.source === "compra" && item.balance > item.scheduledAmount ? <TableHoverActionMenu label={`Programar pago de ${item.provider}`} width={330}><form action={scheduleAdministrationSupplierPaymentAction} className="grid gap-2"><input name="id" type="hidden" value={item.id} /><input name="month" type="hidden" value={month} /><input name="notes" type="hidden" value="Programado desde Administración V2" /><Field htmlFor={`admin-payable-${item.id}-amount`} label="Monto"><Input defaultValue={Math.round(item.balance - item.scheduledAmount)} id={`admin-payable-${item.id}-amount`} min="0.01" name="amount" required step="0.01" type="number" /></Field><Field htmlFor={`admin-payable-${item.id}-date`} label="Fecha"><Input defaultValue={item.scheduledDate ?? today} id={`admin-payable-${item.id}-date`} name="date" required type="date" /></Field><Button className="w-full" size="sm" type="submit">Programar pago</Button></form></TableHoverActionMenu> : <span className="text-xs text-[#94a3b8]">—</span>}</DataTableCell></DataTableRow>;
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

        <div className="rounded-xl border border-dashed border-[#b8c5d6] bg-white/60 px-4 py-3 text-xs text-[#64748b]">
          Migración controlada: las pantallas anteriores continúan disponibles por URL como respaldo temporal. Las nuevas operaciones reutilizan las fuentes actuales y conservan la historia.
        </div>
      </div>
    </ModulePage>
  );
}
