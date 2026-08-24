import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { formatCurrency, formatDate } from "@/lib/format";
import { listAccountEntities, listAccountMovements } from "@/lib/accounts";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { COLLECTIONS_READ_PERMISSION } from "@/lib/route-auth";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  Field,
  Select,
  Toolbar,
} from "@/components/ui";

type CurrentAccountsPageProps = {
  searchParams: Promise<{
    type?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function CurrentAccountsPage({ searchParams }: CurrentAccountsPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [COLLECTIONS_READ_PERMISSION]);
  const params = await searchParams;
  const accountType = params.type || "cliente";
  const [result, entities] = await Promise.all([
    listAccountMovements({
      companyId: session.companyId,
      type: accountType,
      name: params.q,
      page: params.page,
      pageSize: "25",
    }),
    listAccountEntities(session.companyId, accountType),
  ]);
  const pdfParams = new URLSearchParams();
  pdfParams.set("type", accountType);
  if (params.q) pdfParams.set("name", params.q);

  return (
    <ModulePage
      active="collections"
      description="Cuentas corrientes de clientes y proveedores."
      session={session}
      title="Cuentas corrientes"
    >
      <div className="grid gap-5">
        <Toolbar ariaLabel="Filtros de cuentas corrientes">
          <form
            action="/treasury/current-accounts"
            className="grid w-full gap-3 md:grid-cols-[180px_minmax(260px,1fr)_auto_auto] md:items-end"
          >
            <Field htmlFor="account-type" label="Tipo">
              <Select defaultValue={accountType} id="account-type" name="type">
                <option value="cliente">Clientes</option>
                <option value="proveedor">Proveedores</option>
              </Select>
            </Field>
            <Field htmlFor="account-entity" label="Entidad">
              <Select defaultValue={params.q ?? ""} id="account-entity" name="q">
                <option value="">Todas</option>
                {entities.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Filtrar</Button>
            <ButtonLink
              href={`/api/pdfs/accounts/current?${pdfParams.toString()}`}
              prefetch={false}
              target="_blank"
              variant="secondary"
            >
              Exportar PDF
            </ButtonLink>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Debe</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(result.meta.totalDebit)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Haber</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(result.meta.totalCredit)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Saldo neto real</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(result.meta.balance)}</div>
          </div>
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Movimientos de cuentas corrientes"
            className="rounded-none border-0 shadow-none"
            minWidth="900px"
            tableLabel="Cuentas corrientes"
          >
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead>Fecha</DataTableHead>
                  <DataTableHead>Entidad</DataTableHead>
                  <DataTableHead>Descripcion</DataTableHead>
                  <DataTableHead align="right">Debe</DataTableHead>
                  <DataTableHead align="right">Haber</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {result.data.length === 0 ? (
                  <DataTableRow className="hover:bg-transparent">
                    <DataTableCell className="py-8 text-center text-[color:var(--muted)]" colSpan={5}>
                      No hay movimientos de cuenta corriente.
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  result.data.map((item) => (
                    <DataTableRow key={item.id}>
                      <DataTableCell className="whitespace-nowrap">{formatDate(item.date)}</DataTableCell>
                      <DataTableCell>{item.entityName}</DataTableCell>
                      <DataTableCell>{item.description}</DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(item.debit)}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(item.credit)}
                      </DataTableCell>
                    </DataTableRow>
                  ))
                )}
              </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/treasury/current-accounts"
            extraParams={{ type: params.type || "cliente" }}
            page={result.meta.page}
            query={params.q ?? ""}
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
