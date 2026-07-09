import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Field,
  Input,
  Select,
  StatCard,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCashMovements, getTreasuryBalances } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_TREASURY_READ_PERMISSION, ADMIN_TREASURY_WRITE_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import { createCashMovementAction } from "./actions";

export default async function CashPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_TREASURY_READ_PERMISSION]);
  const [cash, canWrite, movements] = await Promise.all([
    getTreasuryBalances(session.companyId),
    sessionAllows(session, [ADMIN_TREASURY_WRITE_PERMISSION]),
    getCashMovements({ companyId: session.companyId, pageSize: "20" }),
  ]);

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

        {canWrite ? (
          <Card className="p-4">
            <h2 className="erp-text-title-sm font-black">Registrar movimiento manual</h2>
            <form action={createCashMovementAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field htmlFor="cash-direction" label="Tipo">
                <Select defaultValue="salida" id="cash-direction" name="direction">
                  <option value="entrada">Entrada</option>
                  <option value="salida">Salida</option>
                </Select>
              </Field>
              <Field htmlFor="cash-concept" label="Concepto">
                <Input id="cash-concept" name="concept" placeholder="Ej. Nafta, gastos varios" required />
              </Field>
              <Field htmlFor="cash-amount" label="Monto">
                <Input id="cash-amount" min="0.01" name="amount" required step="0.01" type="number" />
              </Field>
              <Field htmlFor="cash-date" label="Fecha">
                <Input defaultValue={localDateIso()} id="cash-date" name="date" required type="date" />
              </Field>
              <Field className="sm:col-span-2 lg:col-span-3" htmlFor="cash-notes" label="Notas">
                <Input id="cash-notes" name="notes" placeholder="Opcional" />
              </Field>
              <div className="flex items-end">
                <Button type="submit">Registrar</Button>
              </div>
            </form>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <DataTable
            caption="Movimientos de caja (manuales y automaticos)"
            className="rounded-none border-0 shadow-none"
            minWidth="820px"
            tableLabel="Movimientos de caja"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Tipo</DataTableHead>
                <DataTableHead>Concepto</DataTableHead>
                <DataTableHead align="right">Monto</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {movements.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={4}>
                    <EmptyState
                      description="Los movimientos manuales y los pagos registrados van a aparecer aca."
                      title="No hay movimientos de caja"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                movements.data.map((movement) => (
                  <DataTableRow key={movement.id}>
                    <DataTableCell>{formatDate(movement.date)}</DataTableCell>
                    <DataTableCell>
                      {movement.typeLabel}
                      {!movement.affectsBalance ? (
                        <span className="ml-2 text-xs text-[color:var(--muted)]">(informativo, no afecta el saldo)</span>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell>{movement.concept || movement.entityName || "-"}</DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                      {formatCurrency(movement.signedAmount)}
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
