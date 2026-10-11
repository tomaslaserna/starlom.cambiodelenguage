import { redirect } from "next/navigation";
import { saveVendorCommissionAction, saveVendorGoalAction } from "@/app/employees/vendors/actions";
import { HrNavigation } from "@/components/hr-navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  PageHeader,
  StatCard,
  StatusBadge,
  cn,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ADMIN_MOVEMENTS_READ_PERMISSION, sessionAllows, sessionCanReadEmployees } from "@/lib/route-auth";
import { getVendorManagement } from "@/lib/vendors-management";

function progress(current: number, goal: number) {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, (current / goal) * 100));
}

function ProgressLine({ current, goal, label, money = false }: { current: number; goal: number; label: string; money?: boolean }) {
  const percentage = progress(current, goal);
  const currentLabel = money ? formatCurrency(current) : formatNumber(current);
  const goalLabel = goal > 0 ? (money ? formatCurrency(goal) : formatNumber(goal)) : "Sin meta";

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-[#334155]">{label}</span>
        <span className="font-mono text-xs text-[#64748b]">{currentLabel} / {goalLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#e8eef6]">
        <div
          aria-label={`${label}: ${percentage.toFixed(0)}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(percentage)}
          className={cn("h-full rounded-full transition-[width]", percentage >= 100 ? "bg-[#059669]" : "bg-[#2563eb]")}
          role="progressbar"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default async function VendorsManagementPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanReadEmployees(session))) redirect("/");

  const [data, canAudit] = await Promise.all([
    getVendorManagement(session.companyId),
    sessionAllows(session, [ADMIN_MOVEMENTS_READ_PERMISSION]),
  ]);
  const totalQuotes = data.vendors.reduce((sum, item) => sum + item.quotes, 0);
  const acceptedQuotes = data.vendors.reduce((sum, item) => sum + item.acceptedQuotes, 0);
  const closeRate = totalQuotes > 0 ? (acceptedQuotes / totalQuotes) * 100 : 0;
  const commissions = data.vendors.reduce((sum, item) => sum + item.salesTotal * item.commissionRate / 100, 0);

  return (
    <ModulePage active="employees" description="Rendimiento comercial, metas y comisiones del equipo de ventas." session={session} title="Vendedores">
      <div className="grid gap-5">
        <PageHeader
          title="Gestión de vendedores"
          description="Una vista operativa para seguir resultados, metas, cartera y comisiones sin mezclar la gestión salarial."
          eyebrow="Recursos Humanos"
        />
        <HrNavigation active="vendors" canAudit={canAudit} />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard detail="Perfiles con actividad comercial" label="Vendedores" tone="accent" value={data.meta.count} />
          <StatCard detail={`${formatNumber(data.meta.clients)} clientes asignados`} label="Ventas del mes" tone="success" value={formatCurrency(data.meta.salesTotal)} />
          <StatCard detail={`${acceptedQuotes} de ${totalQuotes} presupuestos`} label="Tasa de cierre" tone={closeRate >= 40 ? "success" : "warning"} value={`${closeRate.toFixed(1)}%`} />
          <StatCard detail="Estimación sobre ventas entregadas" label="Comisiones acumuladas" tone="warning" value={formatCurrency(commissions)} />
        </div>

        {data.vendors.length === 0 ? (
          <Card><CardContent><EmptyState title="No hay vendedores configurados" description="Los perfiles comerciales aparecerán cuando tengan rol, clientes, ventas o presupuestos asociados." /></CardContent></Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.vendors.map((vendor, index) => {
              const salesProgress = progress(vendor.salesTotal, vendor.goalSales);
              const commission = vendor.salesTotal * vendor.commissionRate / 100;
              const fieldId = `vendor-${index}`;
              return (
                <Card className="overflow-hidden" key={vendor.vendor}>
                  <CardHeader className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eaf2ff] font-black text-[#1d4ed8]">{vendor.vendor.slice(0, 2).toUpperCase()}</span>
                      <div className="min-w-0">
                        <CardTitle className="truncate">{vendor.vendor}</CardTitle>
                        <CardDescription>{formatNumber(vendor.clients)} clientes a cargo · {formatNumber(vendor.salesCount)} ventas</CardDescription>
                      </div>
                    </div>
                    <StatusBadge tone={salesProgress >= 100 ? "success" : vendor.goalSales > 0 ? "accent" : "neutral"}>
                      {vendor.goalSales > 0 ? `${salesProgress.toFixed(0)}% meta` : "Sin meta"}
                    </StatusBadge>
                  </CardHeader>
                  <CardContent className="grid gap-5">
                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4 sm:grid-cols-4">
                      <div><span className="block text-xs font-semibold uppercase text-[#64748b]">Venta</span><strong className="mt-1 block font-mono text-sm">{formatCurrency(vendor.salesTotal)}</strong></div>
                      <div><span className="block text-xs font-semibold uppercase text-[#64748b]">Presupuestos</span><strong className="mt-1 block text-sm">{vendor.acceptedQuotes}/{vendor.quotes}</strong></div>
                      <div><span className="block text-xs font-semibold uppercase text-[#64748b]">Cierre</span><strong className="mt-1 block text-sm">{vendor.closeRate.toFixed(1)}%</strong></div>
                      <div><span className="block text-xs font-semibold uppercase text-[#64748b]">Comisión</span><strong className="mt-1 block font-mono text-sm">{formatCurrency(commission)}</strong></div>
                    </div>
                    <div className="grid gap-4">
                      <ProgressLine current={vendor.salesTotal} goal={vendor.goalSales} label="Meta de ventas" money />
                      <ProgressLine current={vendor.clients} goal={vendor.goalClients} label="Meta de clientes" />
                    </div>
                    <details className="group rounded-xl border border-[#dbe3ec] bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-bold text-[#174ea6] [&::-webkit-details-marker]:hidden">
                        Configurar metas y comisión
                        <span className="text-lg transition-transform group-open:rotate-45">+</span>
                      </summary>
                      <div className="grid gap-4 border-t border-[#e2e8f0] p-4 lg:grid-cols-2">
                        <form action={saveVendorGoalAction} className="grid gap-3 rounded-lg bg-[#f8fafc] p-3">
                          <input name="vendor" type="hidden" value={vendor.vendor} />
                          <strong className="text-sm">Objetivos mensuales</strong>
                          <Field htmlFor={`${fieldId}-sales-goal`} label="Meta de ventas"><MoneyInput defaultValue={vendor.goalSales} id={`${fieldId}-sales-goal`} min="0" name="goalSales" /></Field>
                          <Field htmlFor={`${fieldId}-clients-goal`} label="Meta de clientes"><Input defaultValue={vendor.goalClients} id={`${fieldId}-clients-goal`} min="0" name="goalClients" type="number" /></Field>
                          <Button size="sm" type="submit" variant="secondary">Guardar metas</Button>
                        </form>
                        <form action={saveVendorCommissionAction} className="grid content-start gap-3 rounded-lg bg-[#f8fafc] p-3">
                          <input name="vendor" type="hidden" value={vendor.vendor} />
                          <strong className="text-sm">Esquema comercial</strong>
                          <Field htmlFor={`${fieldId}-commission`} label="Comisión sobre ventas (%)"><Input defaultValue={vendor.commissionRate} id={`${fieldId}-commission`} max="100" min="0" name="commissionRate" step="0.1" type="number" /></Field>
                          <p className="text-xs leading-5 text-[#64748b]">Con el acumulado actual, corresponde una comisión estimada de {formatCurrency(commission)}.</p>
                          <Button size="sm" type="submit" variant="secondary">Guardar comisión</Button>
                        </form>
                      </div>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ModulePage>
  );
}
