import { ModulePage } from "@/components/module-page";
import { formatCurrency } from "@/lib/format";
import { getSalaryPlan } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_SALARIES_READ_PERMISSION } from "@/lib/route-auth";

export default async function SalariesPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_SALARIES_READ_PERMISSION]);
  const salaries = await getSalaryPlan(session.companyId);

  return (
    <ModulePage
      active="balance"
      description="Sueldos vigentes computados como costo fijo, con provision de aguinaldo y cargas."
      session={session}
      title="Sueldos"
    >
      <div className="grid gap-5">

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Empleados activos</div>
            <div className="mt-2 text-2xl font-semibold">{salaries.meta.activeCount}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Costo mensual vigente</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(salaries.meta.monthlyCost)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Saldo estimado a pagar</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(salaries.meta.payable)}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Empleado</th>
                  <th className="px-4 py-3 font-semibold">Modalidad</th>
                  <th className="px-4 py-3 text-right font-semibold">Sueldo</th>
                  <th className="px-4 py-3 text-right font-semibold">Aguinaldo prop.</th>
                  <th className="px-4 py-3 text-right font-semibold">Cargas</th>
                  <th className="px-4 py-3 text-right font-semibold">Costo total</th>
                  <th className="px-4 py-3 text-right font-semibold">Pagado</th>
                  <th className="px-4 py-3 text-right font-semibold">A pagar</th>
                </tr>
              </thead>
              <tbody>
                {salaries.employees.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={8}>
                      No hay sueldos configurados.
                    </td>
                  </tr>
                ) : (
                  salaries.employees.map((item) => (
                    <tr className="border-t border-[color:var(--border)]" key={item.id}>
                      <td className="px-4 py-4">
                        <div className="font-medium">{item.employee}</div>
                        <div className="text-xs text-[color:var(--muted)]">{item.active ? "Activo" : "Inactivo"}</div>
                      </td>
                      <td className="px-4 py-4">{item.modality}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.monthly)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.bonusProvision)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.charges)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.totalCost)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.paid)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.payable)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ModulePage>
  );
}
