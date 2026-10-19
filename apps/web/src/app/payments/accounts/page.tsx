import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Input } from "@/components/ui";
import { listOpenCustomerAccounts } from "@/lib/customer-accounts";
import { formatCurrency } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { COLLECTIONS_READ_PERMISSION } from "@/lib/route-auth";
import { CustomerAccountsTable } from "./customer-accounts-table";

type AccountsPageProps = { searchParams: Promise<{ q?: string }> };

export default async function CustomerAccountsPage({ searchParams }: AccountsPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [COLLECTIONS_READ_PERMISSION]);
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const { accounts } = await listOpenCustomerAccounts(session.companyId, { query, includeSettled: Boolean(query) });
  const totalDebt = accounts.reduce((sum, account) => sum + Math.max(0, account.balance), 0);
  const totalFavor = accounts.reduce((sum, account) => sum + Math.max(0, -account.balance), 0);
  const debtors = accounts.filter((account) => account.balance > 0).length;

  return (
    <ModulePage active="collections" description="Cobranzas · Clientes" session={session} title="Cuentas corrientes">
      <div className="mx-auto w-full max-w-[1300px] space-y-5">
        <section aria-label="Resumen de cuentas" className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] sm:p-6">
          <div>
            <h2 className="text-sm font-medium text-slate-500">Por cobrar{query ? " · resultados de búsqueda" : ""}</h2>
            <p className="mt-2 break-words text-3xl font-bold tracking-tight text-slate-950 tabular-nums sm:text-4xl">{formatCurrency(totalDebt)}</p>
            <p className="mt-2 text-xs text-slate-500">{debtors} clientes con saldo pendiente</p>
          </div>
          <div className="border-t border-slate-100 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <h2 className="text-sm font-medium text-slate-500">A favor de clientes</h2>
            <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-emerald-700 tabular-nums">{formatCurrency(totalFavor)}</p>
            <p className="mt-2 text-xs text-slate-500">Créditos disponibles para próximas compras</p>
          </div>
        </section>
        <section aria-label="Listado de cuentas" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-slate-100 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight">{query ? "Resultados de búsqueda" : "Cuentas abiertas"}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{accounts.length}</span>
            </div>
            <form action="/payments/accounts" method="get" className="flex flex-wrap gap-2">
              <label htmlFor="accounts-query" className="sr-only">Buscar cliente o CUIT</label>
              <Input defaultValue={query} id="accounts-query" name="q" placeholder="Buscar cliente o CUIT" type="search" className="min-w-0 flex-1 basis-[220px] text-sm" />
              <Button type="submit">Buscar</Button>
              {query ? <ButtonLink href="/payments/accounts" variant="secondary">Limpiar</ButtonLink> : null}
            </form>
            <p className="text-xs text-slate-500">{query ? "La búsqueda incluye cuentas saldadas." : "Sólo cuentas abiertas. Buscá un cliente para consultar también una cuenta saldada."}</p>
          </div>
          <CustomerAccountsTable key={query} accounts={accounts} searching={Boolean(query)} />
        </section>
      </div>
    </ModulePage>
  );
}
