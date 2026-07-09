import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatDate } from "@/lib/format";
import { getAccountsPayable } from "@/lib/admin-metrics";
import { createManualPayableAction, programSupplierPaymentAction } from "@/app/treasury/accounts-payable/actions";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION, PURCHASES_READ_PERMISSION } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import { Button, Card, Field, Input } from "@/components/ui";

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

        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <div className="text-sm text-[color:var(--muted)]">Saldo abierto total</div>
          <div className="mt-2 text-2xl font-semibold">{formatCurrency(payables.meta.total)}</div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div>
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="w-[11%] px-4 py-3 font-semibold">Fecha</th>
                  <th className="w-[16%] px-4 py-3 font-semibold">Origen</th>
                  <th className="w-[25%] px-4 py-3 font-semibold">Concepto</th>
                  <th className="w-[10%] px-4 py-3 font-semibold">Estado</th>
                  <th className="w-[12%] px-4 py-3 text-right font-semibold">Saldo</th>
                  <th className="w-[14%] px-4 py-3 text-right font-semibold">Programado</th>
                  <th className="w-[12%] px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {payables.data.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={7}>
                      No hay cuentas por pagar abiertas.
                    </td>
                  </tr>
                ) : (
                  payables.data.map((item) => (
                    <tr className="border-t border-[color:var(--border)]" key={`${item.source}-${item.id}`}>
                      <td className="px-4 py-4">{formatDate(item.date)}</td>
                      <td className="break-words px-4 py-4">{item.provider}</td>
                      <td className="px-4 py-4">
                        <div className="break-words">{item.concept}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          Total {formatCurrency(item.total)} - pagado {formatCurrency(item.paid)}
                        </div>
                      </td>
                      <td className="break-words px-4 py-4">{item.status}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.balance)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">
                        {item.scheduledAmount > 0 ? (
                          <div>
                            <div>{formatCurrency(item.scheduledAmount)}</div>
                            <div className="text-[color:var(--muted)]">{formatDate(item.scheduledDate)}</div>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-4">
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
                      </td>
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
