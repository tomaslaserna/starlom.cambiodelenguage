import Link from "next/link";
import { notFound } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { ButtonLink, Card, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow, cn } from "@/components/ui";
import { ApiError } from "@/lib/api-response";
import { requireStaffSession } from "@/lib/auth";
import { getCustomerStatement, getCustomerPaymentContext, listCustomerOptions } from "@/lib/customer-accounts";
import { summarizeStatement } from "@/lib/customer-statement-presentation";
import { formatCurrency, formatDate } from "@/lib/format";
import { getTreasuryAccountOptions } from "@/lib/finance";
import { requirePagePermission } from "@/lib/page-auth";
import { COLLECTIONS_READ_PERMISSION } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import { registerCustomerPaymentAction } from "@/app/payments/actions";
import { RegisterPaymentDialog } from "@/app/payments/register-payment-dialog";
import { StatementDateFilter, StatementMovements } from "./statement-movements";

type CustomerStatementPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function CustomerStatementPage({ params, searchParams }: CustomerStatementPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [COLLECTIONS_READ_PERMISSION]);
  const { id } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) notFound();
  const query = await searchParams;
  const from = query.from ?? "";
  const to = query.to ?? "";
  const filteredPeriod = Boolean(from || to);
  const loadStatement = (options: { from?: string; to?: string }) => getCustomerStatement(session.companyId, id, options).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  const fullPromise = loadStatement({});
  const [periodResult, fullResult, customers, treasuryAccounts, paymentContext] = await Promise.all([
    filteredPeriod ? loadStatement({ from, to }) : fullPromise,
    fullPromise,
    listCustomerOptions(session.companyId),
    getTreasuryAccountOptions(session.companyId),
    getCustomerPaymentContext(session.companyId, id),
  ]);
  if (!periodResult || !fullResult) notFound();
  const { customer, statement, unappliedPayments } = periodResult;
  const currentBalance = fullResult.statement.finalBalance;
  const summary = summarizeStatement(statement.lines);
  const today = localDateIso();
  const pdfParams = new URLSearchParams();
  if (from) pdfParams.set("from", from);
  if (to) pdfParams.set("to", to);
  const pdfHref = `/api/pdfs/accounts/statement/${id}${pdfParams.toString() ? `?${pdfParams.toString()}` : ""}`;

  return (
    <ModulePage active="collections" description="Cobranzas · Detalle del cliente" session={session} title="Cuenta corriente">
      <div className="mx-auto w-full max-w-[1300px] space-y-5">
        <Link href="/payments/accounts" className="inline-flex min-h-8 items-center text-xs font-medium text-slate-500 hover:text-blue-700">← Cuentas corrientes</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{customer.name || "Sin nombre"}</h2>
            <p className="mt-1.5 text-xs text-slate-500">{[customer.taxId ? `CUIT ${customer.taxId}` : "", customer.sellerName ? `Vendedor: ${customer.sellerName}` : ""].filter(Boolean).join(" · ") || "Cuenta corriente del cliente"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={pdfHref} prefetch={false} target="_blank" variant="secondary">Exportar PDF</ButtonLink>
            <RegisterPaymentDialog action={registerCustomerPaymentAction} customers={customers} defaultCustomerId={id} treasuryAccounts={treasuryAccounts} today={today} triggerLabel="+ Registrar pago" />
          </div>
        </div>

        <section aria-label="Resumen de la cuenta" className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)] sm:p-6">
          <div>
            <h2 className="text-sm font-medium text-slate-500">Saldo actual · {currentBalance < 0 ? "a favor del cliente" : currentBalance > 0 ? "por cobrar" : "cuenta saldada"}</h2>
            <p className={cn("mt-2 break-words text-3xl font-bold tracking-tight tabular-nums sm:text-4xl", currentBalance < 0 ? "text-emerald-700" : "text-slate-950")}>{formatCurrency(Math.abs(currentBalance))}</p>
            <p className="mt-2 text-xs text-slate-500">Cuenta completa · no cambia con los filtros</p>
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-slate-500">Remitos pendientes</dt><dd className="font-semibold tabular-nums">{formatCurrency(paymentContext.reconciliation.pendingRemittances)}</dd></div>
            </dl>
            {paymentContext.reconciliation.needsReview ? <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">El saldo incluye otros movimientos o inconsistencias por {formatCurrency(Math.abs(paymentContext.reconciliation.difference))} para revisar. No se imputan automáticamente.</p> : null}
          </div>
          <div className="border-t border-slate-100 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <h2 className="text-xs font-medium text-slate-500">{filteredPeriod ? "Movimientos del período" : "Resumen del historial"}</h2>
            <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(125px,1fr))] gap-x-4 gap-y-3">
              <div><dt className="text-xs text-slate-500">Ventas / remitos</dt><dd className="mt-1.5 text-base font-semibold tabular-nums">{formatCurrency(summary.sales)}</dd></div>
              <div><dt className="text-xs text-slate-500">Pagos en cuenta</dt><dd className="mt-1.5 text-base font-semibold text-emerald-700 tabular-nums">{formatCurrency(summary.payments)}</dd></div>
              <div><dt className="text-xs text-slate-500">Notas de crédito</dt><dd className="mt-1.5 text-base font-semibold text-amber-800 tabular-nums">{formatCurrency(summary.creditNotes)}</dd></div>
              {summary.other !== 0 ? <div><dt className="text-xs text-slate-500">Otros ajustes (neto)</dt><dd className="mt-1.5 text-base font-semibold tabular-nums">{formatCurrency(summary.other)}</dd></div> : null}
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Movimientos registrados en cuenta. No incluye pagos pendientes de aplicar.</p>
          </div>
        </section>

        {unappliedPayments.length ? (
          <Card className="overflow-hidden border-amber-300 bg-amber-50/40">
            <div className="border-b border-amber-200 px-4 py-3">
              <h2 className="font-bold">Pagos registrados pendientes de aplicar</h2>
              <p className="mt-1 text-xs text-[color:var(--muted)]">
                Estos comprobantes están cargados, pero no reducen la deuda hasta vincularlos con una venta o remito real.
              </p>
            </div>
            <DataTable
              caption="Pagos pendientes de aplicar"
              className="rounded-none border-0 shadow-none"
              minWidth="760px"
              tableLabel="Pagos registrados pendientes de aplicar"
            >
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead>Fecha</DataTableHead>
                  <DataTableHead>Método / comprobante</DataTableHead>
                  <DataTableHead align="right">Pago</DataTableHead>
                  <DataTableHead align="right">Pendiente</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {unappliedPayments.map((payment) => {
                  const pendingAmount = Math.max(0, payment.amount - payment.appliedAmount);
                  return (
                    <DataTableRow key={payment.id}>
                      <DataTableCell className="whitespace-nowrap text-xs">{formatDate(payment.date)}</DataTableCell>
                      <DataTableCell className="text-xs">
                        <span className="font-semibold capitalize">{payment.method || "Pago"}</span>
                        {payment.reference ? <span> · {payment.reference}</span> : null}
                        {payment.notes ? <div className="mt-1 text-[color:var(--muted)]">{payment.notes}</div> : null}
                      </DataTableCell>
                      <DataTableCell align="right" className="font-mono text-xs">{formatCurrency(payment.amount)}</DataTableCell>
                      <DataTableCell align="right" className="font-mono text-xs font-bold">{formatCurrency(pendingAmount)}</DataTableCell>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
          </Card>
        ) : null}


        <section aria-label="Movimientos de cuenta corriente" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-2"><h2 className="text-base font-semibold">Movimientos</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{statement.lines.length}</span></div>
            <StatementDateFilter key={`dates-${from}-${to}`} clientId={id} from={from} to={to} />
          </div>
          <StatementMovements key={`${id}-${from}-${to}`} statement={statement} from={from} to={to} />
        </section>
      </div>
    </ModulePage>
  );
}
