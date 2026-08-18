import Link from "next/link";
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
  PageHeader,
  StatCard,
  Toolbar,
} from "@/components/ui";
import { listOpenCustomerAccounts } from "@/lib/customer-accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { COLLECTIONS_READ_PERMISSION } from "@/lib/route-auth";

type AccountsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function CustomerAccountsPage({ searchParams }: AccountsPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [COLLECTIONS_READ_PERMISSION]);

  const params = await searchParams;
  const query = params.q ?? "";
  const { accounts } = await listOpenCustomerAccounts(session.companyId, { query });

  const totalDebt = accounts.reduce((sum, account) => (account.balance > 0 ? sum + account.balance : sum), 0);
  const totalFavor = accounts.reduce((sum, account) => (account.balance < 0 ? sum + Math.abs(account.balance) : sum), 0);

  return (
    <ModulePage
      active="collections"
      description="Saldos abiertos de cuenta corriente por cliente, con antiguedad de deuda."
      session={session}
      title="Cuentas corrientes"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Clientes con saldo distinto de cero en su cuenta corriente."
          title="Cuentas abiertas"
        />

        <Toolbar ariaLabel="Busqueda de cuentas abiertas">
          <form
            action="/payments/accounts"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
          >
            <Field htmlFor="accounts-query" label="Buscar">
              <Input
                defaultValue={query}
                id="accounts-query"
                name="q"
                placeholder="Cliente o CUIT"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-2">
          <StatCard
            className="p-3"
            detail="Suma de saldos deudores"
            label="Deuda total"
            tone="danger"
            value={formatCurrency(totalDebt)}
          />
          <StatCard
            className="p-3"
            detail="Suma de saldos acreedores"
            label="A favor"
            tone="success"
            value={formatCurrency(totalFavor)}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Cuentas corrientes abiertas de clientes"
            className="rounded-none border-0 shadow-none"
            minWidth="1080px"
            tableLabel="Cuentas abiertas"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[22%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[14%] px-2">Vendedor</DataTableHead>
                <DataTableHead className="w-[11%] px-2">Ult. movimiento</DataTableHead>
                <DataTableHead align="right" className="w-[10%] px-2">Al dia</DataTableHead>
                <DataTableHead align="right" className="w-[10%] px-2">+30</DataTableHead>
                <DataTableHead align="right" className="w-[10%] px-2">+60</DataTableHead>
                <DataTableHead align="right" className="w-[10%] px-2">+90</DataTableHead>
                <DataTableHead align="right" className="w-[13%] px-2">Saldo</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {accounts.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={8}>
                    <EmptyState
                      description="No hay clientes con saldo abierto para la busqueda actual."
                      title="Sin cuentas abiertas"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                accounts.map((account) => (
                  <DataTableRow key={account.clientId}>
                    <DataTableCell className="truncate px-2 py-2 font-medium">
                      <Link
                        className="text-[color:var(--accent-strong)] underline-offset-2 hover:underline"
                        href={`/payments/accounts/${account.clientId}`}
                      >
                        {account.name || "Sin nombre"}
                      </Link>
                    </DataTableCell>
                    <DataTableCell className="truncate px-2 py-2 text-xs">
                      {account.sellerName || "-"}
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">
                      {formatDate(account.lastMovementDate)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                      {formatCurrency(account.aging.current)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                      {formatCurrency(account.aging.d30)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                      {formatCurrency(account.aging.d60)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                      {formatCurrency(account.aging.d90)}
                    </DataTableCell>
                    <DataTableCell
                      align="right"
                      className="whitespace-nowrap px-2 py-2 font-mono text-xs font-black"
                      style={{ color: account.balance > 0 ? "var(--danger)" : account.balance < 0 ? "var(--accent-strong)" : undefined }}
                    >
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
