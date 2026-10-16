import Link from "next/link";
import type { getCashflow } from "@/lib/admin-metrics";
import type { getBankReconciliationSummary, getBankReconciliationWorkspace, getTreasuryBalances } from "@/lib/finance";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { periodLabel, type Period } from "@/lib/period-range";
import {
  Button, Card, CardContent, CardHeader, CardTitle,
  DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow,
  Field, Input, MoneyInput, Select, StatusBadge, TableHoverActionMenu, StatCard, cn,
} from "@/components/ui";
import {
  createAdministrationMovementAction, createAdministrationBankAccountAction,
  createAdministrationStatementLineAction, matchAdministrationStatementLineAction,
  ignoreAdministrationStatementLineAction, settleAdministrationEcheqAction,
  settleAdministrationOutgoingEcheqAction,
} from "./actions";

type TreasuryWorkspaceProps = {
  treasury: Awaited<ReturnType<typeof getTreasuryBalances>>;
  cashflow: Awaited<ReturnType<typeof getCashflow>>;
  reconciliation: Awaited<ReturnType<typeof getBankReconciliationSummary>>;
  reconciliationWorkspace: Awaited<ReturnType<typeof getBankReconciliationWorkspace>>;
  canWriteTreasury: boolean;
  month: string;
  today: string;
  period: Period;
};

export function TreasuryWorkspace({
  treasury, cashflow, reconciliation, reconciliationWorkspace, canWriteTreasury, month, today, period,
}: TreasuryWorkspaceProps) {
  const settlementAccounts = treasury.accounts.filter((account) => ["bank", "wallet"].includes(account.accountType));

  return (
    <div className="grid min-w-0 gap-5">
      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-600">Dinero disponible</h2>
              <p className="mt-2 break-words text-3xl font-bold tracking-tight text-slate-950 tabular-nums sm:text-4xl">{formatCurrency(treasury.meta.available)}</p>
              <p className="mt-2 text-sm text-slate-500">Saldo actual de caja, bancos y billeteras.</p>
            </div>
            <Link className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" href="/payments/accounts">Registrar cobro</Link>
          </div>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
            {treasury.accounts.map((account) => (
              <div className="min-w-0 rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200" key={account.accountId}>
                <dt className="text-sm font-medium text-slate-600">{account.account}</dt>
                <dd className="mt-2 break-words text-xl font-semibold text-slate-900 tabular-nums">{formatCurrency(account.balance)}</dd>
              </div>
            ))}
          </dl>
          {treasury.accounts.length === 0 ? <p className="text-sm text-slate-500">Agregá tu primera cuenta desde las herramientas de conciliación.</p> : null}
        </CardContent>
      </Card>

      {treasury.echecks.length > 0 ? (
        <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle>Cheques por cobrar</CardTitle><p className="mt-1 text-sm text-[#64748b]">Se agregan desde Cuentas corrientes, con su fecha de cobro.</p></div><div className="text-right"><strong className="block text-lg tabular-nums text-sky-800">{formatCurrency(treasury.meta.echecks)}</strong><span className="text-xs text-slate-500">{treasury.echecks.length} pendientes</span></div></div></CardHeader>
              <DataTable caption="E-cheqs aceptados pendientes de acreditación" className="rounded-none border-0 shadow-none" minWidth="900px" tableLabel="Cheques por cobrar">
                <DataTableHeader><DataTableRow><DataTableHead>Número</DataTableHead><DataTableHead>Recibido de</DataTableHead><DataTableHead>Vencimiento</DataTableHead><DataTableHead>Estado</DataTableHead><DataTableHead align="right">Importe</DataTableHead><DataTableHead align="center">Acreditación</DataTableHead></DataTableRow></DataTableHeader>
                <DataTableBody>
                  {treasury.echecks.length === 0 ? <DataTableRow><DataTableCell className="py-8 text-center text-[#64748b]" colSpan={6}>No hay E-cheqs pendientes de acreditación.</DataTableCell></DataTableRow> : treasury.echecks.map((cheque) => (
                    <DataTableRow key={cheque.id}>
                      <DataTableCell className="font-mono font-bold">{cheque.number}</DataTableCell>
                      <DataTableCell><strong>{cheque.receivedFrom}</strong><div className="text-xs text-[#64748b]">CUIT {cheque.receivedFromCuit || "—"}</div></DataTableCell>
                      <DataTableCell className="whitespace-nowrap">{formatDate(cheque.dueDate)}</DataTableCell>
                      <DataTableCell><StatusBadge tone="success">Aceptado</StatusBadge></DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono font-bold">{formatCurrency(cheque.amount)}</DataTableCell>
                      <DataTableCell align="center">
                        {canWriteTreasury ? <TableHoverActionMenu label={`Acreditar E-cheq ${cheque.number}`} width={360}>
                          <form action={settleAdministrationEcheqAction} className="grid gap-3">
                            <input name="id" type="hidden" value={cheque.id} /><input name="month" type="hidden" value={month} />
                            <Field htmlFor={`echeq-${cheque.id}-account`} label="Cuenta de destino"><Select id={`echeq-${cheque.id}-account`} name="accountId" required>{settlementAccounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.account}</option>)}</Select></Field>
                            <Field htmlFor={`echeq-${cheque.id}-date`} label="Fecha de acreditación"><Input defaultValue={cheque.dueDate} id={`echeq-${cheque.id}-date`} name="settlementDate" required type="date" /></Field>
                            <Button className="w-full" disabled={settlementAccounts.length === 0} size="sm" type="submit">Marcar acreditado</Button>
                          </form>
                        </TableHoverActionMenu> : <span className="text-xs text-[#94a3b8]">Solo lectura</span>}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </Card>
      ) : (
        <p className="px-1 text-sm text-slate-500">Sin cheques pendientes de cobro. Los próximos se agregarán al registrar el pago en <Link className="font-medium text-blue-700 underline-offset-4 hover:underline" href="/payments/accounts">Cuentas corrientes</Link>.</p>
      )}

      {treasury.outgoingEchecks.length > 0 ? (
        <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle>E-cheqs emitidos</CardTitle><p className="mt-1 text-sm text-[#64748b]">Pagos ya entregados a proveedores, pendientes de débito bancario.</p></div><div className="text-right"><strong className="block text-lg tabular-nums text-amber-800">{formatCurrency(treasury.meta.outgoingEchecks)}</strong><span className="text-xs text-slate-500">{treasury.outgoingEchecks.length} pendientes</span></div></div></CardHeader>
              <DataTable caption="E-cheqs emitidos pendientes de débito" className="rounded-none border-0 shadow-none" minWidth="700px" tableLabel="E-cheqs emitidos">
                <DataTableHeader><DataTableRow><DataTableHead>Beneficiario / cheque</DataTableHead><DataTableHead>Fecha de pago</DataTableHead><DataTableHead>Estado</DataTableHead><DataTableHead align="right">Importe</DataTableHead><DataTableHead align="center">Débito</DataTableHead></DataTableRow></DataTableHeader>
                <DataTableBody>
                  {treasury.outgoingEchecks.map((cheque) => (
                    <DataTableRow key={cheque.id}>
                      <DataTableCell><strong>{cheque.beneficiary}</strong><div className="mt-1 text-xs text-slate-500">{cheque.accountName} · N° {cheque.number}</div></DataTableCell>
                      <DataTableCell className="whitespace-nowrap">{formatDate(cheque.dueDate)}</DataTableCell>
                      <DataTableCell><StatusBadge tone={cheque.status === "accepted" ? "success" : "warning"}>{cheque.status === "accepted" ? "Aceptado" : "Emitido"}</StatusBadge></DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono font-bold">{formatCurrency(cheque.amount)}</DataTableCell>
                      <DataTableCell align="center">
                        {canWriteTreasury ? <TableHoverActionMenu label={`Marcar debitado E-cheq ${cheque.number}`} width={340}>
                          <form action={settleAdministrationOutgoingEcheqAction} className="grid gap-3">
                            <input name="id" type="hidden" value={cheque.id} /><input name="month" type="hidden" value={month} />
                            <Field htmlFor={`outgoing-echeq-${cheque.id}-date`} label="Fecha de débito"><Input defaultValue={today} max={today} id={`outgoing-echeq-${cheque.id}-date`} name="settlementDate" required type="date" /></Field>
                            <Button className="w-full" size="sm" type="submit">Confirmar débito</Button>
                          </form>
                        </TableHoverActionMenu> : <span className="text-xs text-[#94a3b8]">Solo lectura</span>}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </Card>
      ) : null}

      {canWriteTreasury ? <details className="group rounded-2xl border border-slate-200 bg-white">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">Registrar movimiento manual</summary>
              <CardContent className="border-t border-slate-100">
                <form action={createAdministrationMovementAction} className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  <input name="month" type="hidden" value={month} />
                  <Field htmlFor="admin-movement-account" label="Cuenta"><Select id="admin-movement-account" name="accountId" required>{treasury.accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.account}</option>)}</Select></Field>
                  <Field htmlFor="admin-movement-direction" label="Tipo"><Select defaultValue="salida" id="admin-movement-direction" name="direction"><option value="entrada">Entrada</option><option value="salida">Salida</option></Select></Field>
                  <Field htmlFor="admin-movement-concept" label="Concepto" required><Input id="admin-movement-concept" name="concept" required /></Field>
                  <Field htmlFor="admin-movement-amount" label="Monto" required><MoneyInput id="admin-movement-amount" min="0.01" name="amount" required /></Field>
                  <Field htmlFor="admin-movement-date" label="Fecha" required><Input defaultValue={today} id="admin-movement-date" name="date" required type="date" /></Field>
                  <Field htmlFor="admin-movement-notes" label="Notas"><Input id="admin-movement-notes" name="notes" /></Field>
                  <Button disabled={treasury.accounts.length === 0} type="submit">Registrar</Button>
                </form>
              </CardContent>
            </details> : null}

      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">Ver proyección de caja</summary>
        <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-3">
          {cashflow.meta.horizons.map((horizon) => (
            <div className="min-w-0 rounded-xl bg-slate-50 p-4" key={horizon.days}>
              <h3 className="text-sm font-semibold text-slate-700">Próximos {horizon.days} días</h3>
              <p className={cn("mt-2 break-words text-xl font-semibold tabular-nums", horizon.net >= 0 ? "text-emerald-700" : "text-red-700")}>{formatCurrency(horizon.net)}</p>
              <p className="mt-1 text-xs text-slate-500">Variación prevista · Entra {formatCurrency(horizon.inflow)} · Sale {formatCurrency(horizon.outflow)}</p>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">Herramientas de conciliación</summary>
        <div className="grid gap-5 border-t border-slate-100 p-4 sm:p-5">
          <p className="text-sm text-slate-500">Compará los movimientos con el extracto del banco cuando necesites revisar una diferencia.</p>
          {treasury.reconciliationIssues.map((issue) => (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950" key={issue.paymentId}>El cobro {issue.reference || issue.paymentId} difiere de sus cheques por {formatCurrency(issue.difference)}. Revisá sus comprobantes.</p>
          ))}
          <Card>
              <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Estado de conciliación · {periodLabel(period)}</CardTitle><StatusBadge tone={reconciliation.ready ? "success" : "warning"}>{reconciliation.ready ? "Conciliado" : "Pendiente"}</StatusBadge></div></CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatCard detail={`${reconciliation.activeAccounts} cuentas activas`} label="Líneas importadas" value={formatNumber(reconciliation.importedLines)} />
                  <StatCard detail={`${reconciliation.matchedLines} líneas completas`} label="Cobertura conciliada" tone={reconciliation.ready ? "success" : "info"} value={`${reconciliation.coveragePercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`} />
                  <StatCard detail={`${reconciliation.partialLines} parciales · ${reconciliation.pendingLines} pendientes`} label="Movimientos a revisar" tone={reconciliation.pendingLines + reconciliation.partialLines > 0 ? "warning" : "success"} value={formatNumber(reconciliation.pendingLines + reconciliation.partialLines)} />
                  <StatCard detail={`Sobre ${formatCurrency(reconciliation.statementAmount)}`} label="Importe sin conciliar" tone={reconciliation.unmatchedAmount > 0 ? "danger" : "success"} value={formatCurrency(reconciliation.unmatchedAmount)} />
                </div>
              </CardContent>
            </Card>
            {canWriteTreasury ? <div className="grid gap-5 2xl:grid-cols-2">
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
                      <Field htmlFor="admin-statement-amount" label="Importe" required><MoneyInput id="admin-statement-amount" min="0.01" name="amount" required /></Field>
                      <Field htmlFor="admin-statement-description" label="Descripción" required><Input id="admin-statement-description" name="description" required /></Field>
                      <Field htmlFor="admin-statement-reference" label="Referencia"><Input id="admin-statement-reference" name="reference" /></Field>
                      <div className="sm:col-span-2"><Button className="w-full" type="submit">Agregar al extracto</Button></div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div> : null}
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
                          {open && canWriteTreasury ? (
                            <TableHoverActionMenu label={`Conciliar ${line.description}`} width={390}>
                              <div className="grid gap-4">
                                <form action={matchAdministrationStatementLineAction} className="grid gap-2">
                                  <input name="lineId" type="hidden" value={line.id} /><input name="month" type="hidden" value={month} />
                                  <Field htmlFor={`admin-match-${line.id}-payment`} label="Cobro o pago registrado"><Select id={`admin-match-${line.id}-payment`} name="paymentId" required><option value="">Seleccionar movimiento</option>{reconciliationWorkspace.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{formatDate(candidate.date)} · {candidate.entityName} · {formatCurrency(candidate.remainingAmount)}</option>)}</Select></Field>
                                  <Field htmlFor={`admin-match-${line.id}-amount`} label="Importe a conciliar"><MoneyInput defaultValue={line.remainingAmount} id={`admin-match-${line.id}-amount`} max={line.remainingAmount} min="0.01" name="amount" required /></Field>
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
        </div>
      </details>
    </div>
  );
}
