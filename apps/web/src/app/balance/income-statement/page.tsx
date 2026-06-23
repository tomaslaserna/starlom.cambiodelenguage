import { ModulePage } from "@/components/module-page";
import { SectionTabs } from "@/components/section-tabs";
import { formatCurrency } from "@/lib/format";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";

export default async function IncomeStatementPage() {
  const session = await requireStaffSession();
  const metrics = await getAdminMetrics(session.companyId);

  const rows = [
    { label: "Ventas entregadas", amount: metrics.sales.current },
    { label: "Costo de mercaderia vendida", amount: -metrics.margin.grossCost },
    { label: "Ganancia bruta", amount: metrics.margin.grossProfit, strong: true },
    { label: "Costos fijos operativos y sueldos vigentes", amount: -metrics.margin.operatingCosts },
    { label: "Resultado operativo", amount: metrics.margin.operatingResult, strong: true },
  ];

  return (
    <ModulePage
      active="balance"
      description="Estado de resultados mensual con sueldos vigentes incluidos como costos fijos."
      session={session}
      title="Estado de resultados"
    >
      <div className="grid gap-5">
        <SectionTabs
          tabs={[
            { href: "/balance", label: "Resumen" },
            { href: "/balance/income-statement", label: "Estado de resultados", active: true },
            { href: "/balance/salaries", label: "Sueldos" },
            { href: "/balance/dividends", label: "Dividendos" },
          ]}
        />

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Concepto</th>
                <th className="px-4 py-3 text-right font-semibold">Monto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-[color:var(--border)]" key={row.label}>
                  <td className={`px-4 py-4 ${row.strong ? "font-semibold" : ""}`}>{row.label}</td>
                  <td className={`px-4 py-4 text-right font-mono text-xs ${row.strong ? "font-semibold" : ""}`}>
                    {formatCurrency(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ModulePage>
  );
}
