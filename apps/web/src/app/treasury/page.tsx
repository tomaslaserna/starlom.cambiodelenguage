import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatDate } from "@/lib/format";
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
  StatusBadge,
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

        <div className="grid gap-3 md:grid-cols-5">
          <StatCard label="Total tesorería" tone="accent" value={formatCurrency(treasury.meta.total)} />
          <StatCard label="Disponible" tone="success" value={formatCurrency(treasury.meta.available)} />
          <StatCard label="E-cheqs en cartera" value={formatCurrency(treasury.meta.echecks)} />
          <StatCard label="Efectivo" tone="success" value={formatCurrency(treasury.meta.cash)} />
          <StatCard label="Bancos y billeteras" value={formatCurrency(treasury.meta.bank + treasury.meta.wallet)} />
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
                  <DataTableRow key={account.accountId}>
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
        <Card className="overflow-hidden">
          <DataTable caption="Valores aceptados pendientes de acreditación" className="rounded-none border-0 shadow-none" tableLabel="E-cheqs en cartera">
            <DataTableHeader><DataTableRow><DataTableHead>Número</DataTableHead><DataTableHead>Recibido de</DataTableHead><DataTableHead>Vencimiento</DataTableHead><DataTableHead>Estado</DataTableHead><DataTableHead align="right">Importe</DataTableHead></DataTableRow></DataTableHeader>
            <DataTableBody>{treasury.echecks.map((cheque) => <DataTableRow key={cheque.id}><DataTableCell className="font-mono">{cheque.number}</DataTableCell><DataTableCell>{cheque.receivedFrom}</DataTableCell><DataTableCell>{formatDate(cheque.dueDate)}</DataTableCell><DataTableCell><StatusBadge tone="success">Aceptado</StatusBadge></DataTableCell><DataTableCell align="right" className="font-mono">{formatCurrency(cheque.amount)}</DataTableCell></DataTableRow>)}</DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
