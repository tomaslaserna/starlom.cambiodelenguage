import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Input } from "@/components/ui";
import { listOpenCustomerAccounts } from "@/lib/customer-accounts";
import { formatCurrency } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { COLLECTIONS_READ_PERMISSION } from "@/lib/route-auth";
import { customerReputations } from "@/lib/customer-reputation";
import { CustomerAccountsTable } from "./customer-accounts-table";
import { reputationBand } from "@/components/customer-reputation";

type AccountsPageProps = { searchParams: Promise<{ q?: string; reputacion?: string; plazo?: string; mora?: string; orden?: string }> };

export default async function CustomerAccountsPage({ searchParams }: AccountsPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [COLLECTIONS_READ_PERMISSION]);
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const { accounts: allAccounts } = await listOpenCustomerAccounts(session.companyId, { query, includeSettled: Boolean(query) });
  const scores = await customerReputations(session.companyId, allAccounts.map(a => a.clientId));
  const terms = [...new Set(allAccounts.flatMap(a => a.paymentTermDays == null ? [] : [a.paymentTermDays]))].sort((a,b) => a-b);
  const band = params.reputacion || "";
  const term = params.plazo || "";
  const minDays = Number(params.mora) || 0;
  const byDelay = params.orden === "mora";
  const filtered = Boolean(query || band || term || minDays || byDelay);
  const accounts = allAccounts.filter(account =>
    (!band || reputationBand(scores[account.clientId]?.score) === band) &&
    (!term || String(account.paymentTermDays ?? "sin-datos") === term) &&
    account.overdueDays >= minDays);
  if (byDelay) accounts.sort((a,b) => b.overdueDays - a.overdueDays || b.balance - a.balance);
  const sortLink = (order: string) => {
    const next = new URLSearchParams();
    for (const [key,value] of Object.entries({ q: query, reputacion: band, plazo: term, mora: params.mora, orden: order })) {
      if (value) next.set(key,value);
    }
    return "/payments/accounts?" + next.toString();
  };
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
            <p className="mt-2 text-xs text-slate-500">Saldos a favor registrados en las cuentas</p>
          </div>
        </section>
        <section aria-label="Listado de cuentas" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-slate-100 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight">{query ? "Resultados de búsqueda" : "Cuentas abiertas"}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{accounts.length}</span>
            </div>
            <form key={JSON.stringify(params)} action="/payments/accounts" method="get" className="flex flex-wrap items-end gap-2 [&_select]:block [&_select]:h-10 [&_select]:rounded-lg [&_select]:border [&_select]:px-2 [&_select]:text-sm [&_label]:text-xs">
              <label htmlFor="accounts-query" className="sr-only">Buscar cliente o CUIT</label>
              <Input defaultValue={query} id="accounts-query" name="q" placeholder="Buscar cliente o CUIT" type="search" className="min-w-0 flex-1 basis-[220px] text-sm" />
              <label>Reputación<select name="reputacion" defaultValue={band}><option value="">Todas</option><option value="baja">Baja · 0–54</option><option value="media">Media · 55–79</option><option value="alta">Alta · 80–100</option><option value="sin-datos">Sin datos</option></select></label>
              <label>Plazo pactado<select name="plazo" defaultValue={term}><option value="">Todos</option>{terms.map(d => <option key={d} value={d}>{d === 0 ? "Contado" : d+" días"}</option>)}<option value="sin-datos">Sin plazo cargado</option></select></label>
              <label>Días de mora<select name="mora" defaultValue={params.mora || ""}><option value="">Todos</option><option value="1">1 o más</option><option value="8">8 o más</option><option value="16">16 o más</option><option value="31">31 o más</option></select></label>
              <input type="hidden" name="orden" value={byDelay ? "mora" : "saldo"} />
              <Button type="submit">Filtrar</Button>
              {filtered ? <ButtonLink href="/payments/accounts" variant="secondary">Limpiar</ButtonLink> : null}
            </form>
            <p className="text-xs text-slate-500">{query ? "La búsqueda incluye cuentas saldadas." : "Sólo cuentas abiertas. Buscá un cliente para consultar también una cuenta saldada."}</p>
          </div>
          <CustomerAccountsTable key={JSON.stringify(params)} accounts={accounts} scores={scores} searching={filtered} byDelay={byDelay} delayLink={sortLink("mora")} balanceLink={sortLink("saldo")} />
        </section>
      </div>
    </ModulePage>
  );
}
