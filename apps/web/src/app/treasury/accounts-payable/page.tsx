import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatDate } from "@/lib/format";
import { getAccountsPayable } from "@/lib/admin-metrics";
import { createManualPayableAction, programSupplierPaymentAction } from "@/app/treasury/accounts-payable/actions";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION, PURCHASES_READ_PERMISSION } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import {
  Button,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Field,
  Input,
  StatCard,
  StatusBadge,
} from "@/components/ui";

type AccountsPayablePageProps = {
  searchParams: Promise<{
    created?: string;
    scheduled?: string;
  }>;
};

export default async function AccountsPayablePage({ searchParams }: AccountsPayablePageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION, PURCHASES_READ_PERMISSION]);
  const params = await searchParams;
  const payables = await getAccountsPayable(session.companyId);
  const today = localDateIso();

  return (
    <ModulePage
      active="treasury"
      description="Compras recibidas, sueldos por pagar, servicios proyectados e impuestos pendientes."
      session={session}
      title="Cuentas por pagar"
    >
      <div className="grid gap-5">
        {params.created ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Cuenta por pagar cargada y proyectada en cash flow.
          </div>
        ) : null}
        {params.scheduled ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Pago programado y enviado a solicitudes para aprobacion.
          </div>
        ) : null}

        <Card className="p-4">
          <form action={createManualPayableAction} className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px_auto] lg:items-end">
            <Field htmlFor="payable-concept" label="Concepto" required>
              <Input id="payable-concept" name="concept" required />
            </Field>
            <Field htmlFor="payable-amount" label="Monto" required>
              <Input id="payable-amount" min="0" name="amount" required step="0.01" type="number" />
            </Field>
            <Field htmlFor="payable-date" label="Vencimiento" required>
              <Input id="payable-date" name="date" required type="date" />
            </Field>
            <Button type="submit">Agregar cuenta</Button>
          </form>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="Saldo abierto total" tone="warning" value={formatCurrency(payables.meta.total)} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Cuentas pendientes de pago"
            className="rounded-none border-0 shadow-none"
            minWidth="1080px"
            tableLabel="Cuentas por pagar"
            tableProps={{ className: "table-fixed" }}
          >
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead className="w-[11%]">Fecha</DataTableHead>
                  <DataTableHead className="w-[16%]">Origen</DataTableHead>
                  <DataTableHead className="w-[25%]">Concepto</DataTableHead>
                  <DataTableHead className="w-[10%]">Estado</DataTableHead>
                  <DataTableHead align="right" className="w-[12%]">Saldo</DataTableHead>
                  <DataTableHead align="right" className="w-[14%]">Programado</DataTableHead>
                  <DataTableHead className="w-[12%]">Acciones</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {payables.data.length === 0 ? (
                  <DataTableRow className="hover:bg-transparent">
                    <DataTableCell className="py-8 text-center text-[color:var(--muted)]" colSpan={7}>
                      No hay cuentas por pagar abiertas.
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  payables.data.map((item) => (
                    <DataTableRow key={`${item.source}-${item.id}`}>
                      <DataTableCell className="whitespace-nowrap">{formatDate(item.date)}</DataTableCell>
                      <DataTableCell className="break-words">{item.provider}</DataTableCell>
                      <DataTableCell>
                        <div className="break-words">{item.concept}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          Total {formatCurrency(item.total)} - pagado {formatCurrency(item.paid)}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="break-words">
                        <StatusBadge tone="warning">{item.status}</StatusBadge>
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(item.balance)}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {item.scheduledAmount > 0 ? (
                          <div>
                            <div>{formatCurrency(item.scheduledAmount)}</div>
                            <div className="text-[color:var(--muted)]">{formatDate(item.scheduledDate)}</div>
                          </div>
                        ) : (
                          "-"
                        )}
                      </DataTableCell>
                      <DataTableCell>
                        {item.source === "compra" && item.balance > item.scheduledAmount ? (
                          <details className="rounded-[8px] border border-[color:var(--border)] bg-[color:var(--panel)] p-2">
                            <summary className="flex min-h-[var(--control-height-md)] cursor-pointer list-none select-none items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--accent)] px-4 font-black text-white shadow-sm [&::-webkit-details-marker]:hidden">
                              Programar
                            </summary>
                            <form action={programSupplierPaymentAction} className="mt-2 grid gap-2">
                              <input name="id" type="hidden" value={item.id} />
                              <input name="notes" type="hidden" value="Programado desde cuentas por pagar" />
                              <Field className="gap-1" htmlFor={`payable-${item.id}-amount`} label="Monto">
                                <Input
                                  defaultValue={(item.balance - item.scheduledAmount).toFixed(2)}
                                  id={`payable-${item.id}-amount`}
                                  min="0"
                                  name="amount"
                                  required
                                  step="0.01"
                                  type="number"
                                />
                              </Field>
                              <Field className="gap-1" htmlFor={`payable-${item.id}-date`} label="Fecha">
                                <Input
                                  defaultValue={item.scheduledDate ?? today}
                                  id={`payable-${item.id}-date`}
                                  name="date"
                                  required
                                  type="date"
                                />
                              </Field>
                              <Button className="w-full" size="sm" type="submit">
                                Enviar
                              </Button>
                            </form>
                          </details>
                        ) : (
                          <span className="text-xs text-[color:var(--muted)]">-</span>
                        )}
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
