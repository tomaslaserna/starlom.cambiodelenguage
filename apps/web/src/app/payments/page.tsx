import Link from "next/link";
import { redirect } from "next/navigation";
import { MetricIcon } from "@/components/metric-icon";
import { ModulePage } from "@/components/module-page";
import { ButtonLink, Card, PageHeader, StatCard } from "@/components/ui";
import { listOpenCustomerAccounts, listPendingCustomerPayments } from "@/lib/customer-accounts";
import { formatCurrency } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanReadCollections } from "@/lib/route-auth";

export default async function PaymentsPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanReadCollections(session))) redirect("/");

  const [{ accounts }, pendingPayments] = await Promise.all([
    listOpenCustomerAccounts(session.companyId),
    listPendingCustomerPayments(session.companyId),
  ]);

  const debtorAccounts = accounts.filter((account) => account.balance > 0.005);
  const overdueAccounts = debtorAccounts.filter((account) => account.aging.overdueTotal > 0.005);
  const currentAccounts = debtorAccounts.filter(
    (account) => account.aging.current > 0.005 && account.aging.overdueTotal <= 0.005,
  );
  const totalDebt = debtorAccounts.reduce((sum, account) => sum + account.balance, 0);
  const creditBalances = accounts.reduce(
    (sum, account) => (account.balance < -0.005 ? sum + Math.abs(account.balance) : sum),
    0,
  );

  return (
    <ModulePage
      active="collections"
      description="Resumen de cuentas abiertas y prioridades de cobranza."
      session={session}
      title="Cobros y pagos"
    >
      <div className="grid gap-5">
        <PageHeader
          actions={<ButtonLink href="/payments/accounts">Ir a Cuentas corrientes</ButtonLink>}
          description="Vista general para detectar deudas vencidas y próximas a vencer. La gestión de cobranzas se realiza en Cuentas corrientes."
          title="Resumen de cobranzas"
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard detail={formatCurrency(totalDebt)} icon={<MetricIcon name="wallet" />} label="Clientes con cuentas abiertas" tone="danger" value={debtorAccounts.length} />
          <StatCard detail="Con deuda vencida" icon={<MetricIcon name="alert" />} label="Clientes en mora" tone={overdueAccounts.length > 0 ? "danger" : "success"} value={overdueAccounts.length} />
          <StatCard detail="Deuda al día o por vencer" icon={<MetricIcon name="calendar" />} label="Clientes por vencer" tone={currentAccounts.length > 0 ? "warning" : "success"} value={currentAccounts.length} />
          <StatCard detail="Cobros esperando autorización" icon={<MetricIcon name="receipt" />} label="Pendientes de aprobación" tone={pendingPayments.length > 0 ? "warning" : "success"} value={pendingPayments.length} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="grid gap-3 p-5">
            <div>
              <h2 className="text-base font-black">Gestionar cobranzas</h2>
              <p className="mt-1 text-sm text-[color:var(--muted)]">Consultá saldos, antigüedad, movimientos y registrá cobros desde la cuenta corriente de cada cliente.</p>
            </div>
            <ButtonLink href="/payments/accounts">Abrir Cuentas corrientes</ButtonLink>
          </Card>
          <Card className="grid gap-3 p-5">
            <div>
              <h2 className="text-base font-black">Situación general</h2>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Deuda pendiente: <strong>{formatCurrency(totalDebt)}</strong>
                {creditBalances > 0 ? <> · Saldos a favor: <strong>{formatCurrency(creditBalances)}</strong></> : null}
              </p>
            </div>
            {pendingPayments.length > 0 ? (
              <Link className="text-sm font-bold text-[color:var(--accent-strong)] hover:underline" href="/admin/approvals">Revisar {pendingPayments.length} cobros pendientes de aprobación</Link>
            ) : (
              <span className="text-sm font-semibold text-[color:var(--success)]">No hay cobros pendientes de aprobación.</span>
            )}
          </Card>
        </div>
      </div>
    </ModulePage>
  );
}
