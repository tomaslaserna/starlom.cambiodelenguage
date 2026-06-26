import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { fastOr } from "@/lib/fast-data";
import { formatCurrency, formatDate } from "@/lib/format";
import { listAccountMovements } from "@/lib/accounts";
import { requireStaffSession } from "@/lib/auth";

type CurrentAccountsPageProps = {
  searchParams: Promise<{
    type?: string;
    q?: string;
    page?: string;
  }>;
};

export default async function CurrentAccountsPage({ searchParams }: CurrentAccountsPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const result = await fastOr(
    listAccountMovements({
      companyId: session.companyId,
      type: params.type || "cliente",
      name: params.q,
      page: params.page,
      pageSize: "25",
    }),
    {
      data: [],
      meta: {
        page: Number.isFinite(page) && page > 0 ? page : 1,
        pageSize: 25,
        total: 0,
        totalPages: 1,
        totalDebit: 0,
        totalCredit: 0,
        balance: 0,
      },
    },
  );

  return (
    <ModulePage
      active="collections"
      description="Cuentas corrientes de clientes y proveedores."
      session={session}
      title="Cuentas corrientes"
    >
      <div className="grid gap-5">
        <form
          action="/treasury/current-accounts"
          className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[220px_1fr_auto] md:items-center"
        >
          <select
            className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 text-sm"
            defaultValue={params.type || "cliente"}
            name="type"
          >
            <option value="cliente">Clientes</option>
            <option value="proveedor">Proveedores</option>
          </select>
          <input
            className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 text-sm"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Buscar entidad"
          />
          <button className="min-h-11 rounded-md bg-[color:var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[color:var(--accent-strong)]">
            Filtrar
          </button>
        </form>

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
            <div className="text-sm text-[color:var(--muted)]">Saldo</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(result.meta.balance)}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Entidad</th>
                  <th className="px-4 py-3 font-semibold">Descripcion</th>
                  <th className="px-4 py-3 text-right font-semibold">Debe</th>
                  <th className="px-4 py-3 text-right font-semibold">Haber</th>
                </tr>
              </thead>
              <tbody>
                {result.data.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={5}>
                      No hay movimientos de cuenta corriente.
                    </td>
                  </tr>
                ) : (
                  result.data.map((item) => (
                    <tr className="border-t border-[color:var(--border)]" key={item.id}>
                      <td className="px-4 py-4">{formatDate(item.date)}</td>
                      <td className="px-4 py-4">{item.entityName}</td>
                      <td className="px-4 py-4">{item.description}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.debit)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.credit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationLinks
            basePath="/treasury/current-accounts"
            extraParams={{ type: params.type || "cliente" }}
            page={result.meta.page}
            query={params.q ?? ""}
            totalPages={result.meta.totalPages}
          />
        </div>
      </div>
    </ModulePage>
  );
}
