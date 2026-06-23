import { ModulePage } from "@/components/module-page";
import { formatCurrency } from "@/lib/format";
import { getVendorManagement } from "@/lib/vendors-management";
import { requireStaffSession } from "@/lib/auth";
import { saveVendorGoalAction } from "@/app/employees/vendors/actions";

export default async function VendorsManagementPage() {
  const session = await requireStaffSession();
  const data = await getVendorManagement(session.companyId);

  return (
    <ModulePage
      active="employees"
      description="Gestion de vendedores con metas, clientes asignados, presupuestos y tasa de cierre."
      session={session}
      title="Gestion de vendedores"
    >
      <div className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Vendedores</div>
            <div className="mt-2 text-2xl font-semibold">{data.meta.count}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Clientes a cargo</div>
            <div className="mt-2 text-2xl font-semibold">{data.meta.clients}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Ventas del mes</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(data.meta.salesTotal)}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Vendedor</th>
                  <th className="px-4 py-3 font-semibold">Metas</th>
                  <th className="px-4 py-3 text-right font-semibold">Venta mes</th>
                  <th className="px-4 py-3 text-right font-semibold">Clientes</th>
                  <th className="px-4 py-3 text-right font-semibold">Presupuestos</th>
                  <th className="px-4 py-3 text-right font-semibold">Tasa cierre</th>
                </tr>
              </thead>
              <tbody>
                {data.vendors.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={6}>
                      No hay vendedores configurados.
                    </td>
                  </tr>
                ) : (
                  data.vendors.map((vendor) => (
                    <tr className="border-t border-[color:var(--border)]" key={vendor.vendor}>
                      <td className="px-4 py-4 font-medium">{vendor.vendor}</td>
                      <td className="px-4 py-4">
                        <form action={saveVendorGoalAction} className="flex min-w-[260px] gap-2">
                          <input name="vendor" type="hidden" value={vendor.vendor} />
                          <input
                            className="min-h-10 w-28 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-2 text-xs"
                            defaultValue={vendor.goalSales}
                            min="0"
                            name="goalSales"
                            type="number"
                          />
                          <input
                            className="min-h-10 w-20 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-2 text-xs"
                            defaultValue={vendor.goalClients}
                            min="0"
                            name="goalClients"
                            type="number"
                          />
                          <button className="min-h-10 rounded-md border border-[color:var(--border)] px-3 text-xs font-semibold hover:bg-[color:var(--panel-subtle)]">
                            Guardar
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(vendor.salesTotal)}</td>
                      <td className="px-4 py-4 text-right">{vendor.clients}</td>
                      <td className="px-4 py-4 text-right">{vendor.quotes}</td>
                      <td className="px-4 py-4 text-right">{vendor.closeRate.toFixed(1)}%</td>
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
