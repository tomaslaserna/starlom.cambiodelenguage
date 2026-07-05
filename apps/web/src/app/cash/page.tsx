import { ModulePage } from "@/components/module-page";
import {
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  StatCard,
} from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { getTreasuryBalances } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_TREASURY_READ_PERMISSION } from "@/lib/route-auth";

export default async function CashPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_TREASURY_READ_PERMISSION]);
  const cash = await getTreasuryBalances(session.companyId);

  return (
    <ModulePage
      active="cash"
      description="Caja operativa separada de Tesoreria, con saldos actuales por cuenta."
      session={session}
      title="Caja"
    >
      <div className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Caja total" value={formatCurrency(cash.meta.total)} />
          <StatCard label="Efectivo" value={formatCurrency(cash.meta.cash)} />
          <StatCard label="Bancos" value={formatCurrency(cash.meta.bank)} />
          <StatCard label="Otras cuentas" value={formatCurrency(cash.meta.other)} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Saldos actuales por caja y cuenta"
            className="rounded-none border-0 shadow-none"
            minWidth="720px"
            tableLabel="Caja"
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
              {cash.accounts.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={4}>
                    <EmptyState
                      description="Cuando se registren cobros, pagos o movimientos bancarios van a aparecer aca."
                      title="No hay saldos de caja registrados"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                cash.accounts.map((account) => (
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
