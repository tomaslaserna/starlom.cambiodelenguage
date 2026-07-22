import { ModulePage } from "@/components/module-page";
import { formatCurrency } from "@/lib/format";
import { getTreasuryBalances } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_TREASURY_READ_PERMISSION } from "@/lib/route-auth";
import {
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  StatCard,
} from "@/components/ui";

export default async function TreasuryPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_TREASURY_READ_PERMISSION]);
  const treasury = await getTreasuryBalances(session.companyId);

  return (
    <ModulePage
      active="treasury"
      description="Tesoreria principal reducida a saldos actuales totales y por cuenta."
      session={session}
      title="Tesoreria"
    >
      <div className="grid gap-5">

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Total actual" tone="accent" value={formatCurrency(treasury.meta.total)} />
          <StatCard label="Efectivo" tone="success" value={formatCurrency(treasury.meta.cash)} />
          <StatCard label="Cuentas bancarias" value={formatCurrency(treasury.meta.bank)} />
          <StatCard label="Otras cuentas" value={formatCurrency(treasury.meta.other)} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Saldos actuales de tesoreria por cuenta"
            className="rounded-none border-0 shadow-none"
            tableLabel="Saldos de tesoreria"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Cuenta</DataTableHead>
                <DataTableHead>Tipo</DataTableHead>
                <DataTableHead align="right">Movimientos</DataTableHead>
                <DataTableHead align="right">Saldo</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {treasury.accounts.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell className="py-8 text-center text-[color:var(--muted)]" colSpan={4}>
                    No hay saldos actuales registrados.
                  </DataTableCell>
                </DataTableRow>
              ) : (
                treasury.accounts.map((account) => (
                  <DataTableRow key={`${account.accountType}-${account.account}`}>
                    <DataTableCell>{account.account}</DataTableCell>
                    <DataTableCell>{account.accountType}</DataTableCell>
                    <DataTableCell align="right">{account.movements}</DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatCurrency(account.balance)}
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
