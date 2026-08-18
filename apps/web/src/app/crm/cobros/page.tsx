import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
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
  Button,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorOpenAccounts } from "@/lib/crm";
import { formatCurrency, formatDate } from "@/lib/format";
import { sessionCanUseCrm } from "@/lib/route-auth";

type CrmCobrosPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function CrmCobrosPage({ searchParams }: CrmCobrosPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const { accounts: allAccounts } = await getVendorOpenAccounts(session);
  const lowerQuery = query.toLowerCase();
  const accounts = lowerQuery
    ? allAccounts.filter((account) =>
        [account.name, account.taxId].join(" ").toLowerCase().includes(lowerQuery),
      )
    : allAccounts;

  const totalDebt = accounts.reduce((sum, account) => (account.balance > 0 ? sum + account.balance : sum), 0);
  const totalOverdue = accounts.reduce((sum, account) => sum + account.aging.overdueTotal, 0);

  return (
    <ModulePage
      active="crm"
      description="Lo que te deben tus clientes, con saldo corrido y antiguedad de deuda."
      session={session}
      title="CRM · Cobros"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Cobros de tus clientes"
          description="Cuentas corrientes abiertas de tus clientes (propios y a cargo), con antiguedad de deuda."
        />

        <Toolbar ariaLabel="Busqueda de cobros">
          <form action="/crm/cobros" className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
            <Field htmlFor="crm-cobros-query" label="Buscar">
              <Input
                defaultValue={params.q ?? ""}
                id="crm-cobros-query"
                name="q"
                placeholder="Cliente o CUIT"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard className="p-3" detail="Suma de saldos deudores" label="Saldo total a cobrar" tone="danger" value={formatCurrency(totalDebt)} />
          <StatCard className="p-3" detail="Suma de tramos vencidos" label="Monto vencido" tone="danger" value={formatCurrency(totalOverdue)} />
          <StatCard className="p-3" detail="Con la busqueda actual" label="Cuentas visibles" value={accounts.length} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Cuentas corrientes abiertas de tus clientes"
            className="rounded-none border-0 shadow-none"
            minWidth="1080px"
            tableLabel="Cobros del vendedor"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[24%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[13%] px-2">Ult. movimiento</DataTableHead>
                <DataTableHead align="right" className="w-[11%] px-2">Al dia</DataTableHead>
                <DataTableHead align="right" className="w-[11%] px-2">+30</DataTableHead>
                <DataTableHead align="right" className="w-[11%] px-2">+60</DataTableHead>
                <DataTableHead align="right" className="w-[11%] px-2">+90</DataTableHead>
                <DataTableHead align="right" className="w-[19%] px-2">Saldo</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {accounts.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState
                      description="No hay clientes tuyos con saldo abierto para la busqueda actual."
                      title="Sin cobros pendientes"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                accounts.map((account) => (
                  <DataTableRow
                    key={account.clientId}
                    className={account.aging.overdueTotal > 0 ? "bg-[color:var(--danger-subtle)] hover:bg-[color:var(--danger-subtle)]" : undefined}
                  >
                    <DataTableCell className="truncate px-2 py-2 font-medium">
                      {account.name || "Sin nombre"}
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
                      style={{ color: account.balance > 0 ? "var(--danger)" : account.balance < 0 ? "var(--success)" : undefined }}
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
