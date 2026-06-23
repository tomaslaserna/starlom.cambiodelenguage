import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { SectionTabs } from "@/components/section-tabs";
import { formatCurrency, formatDate } from "@/lib/format";
import { getMovementRegister } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";

type MovementsPageProps = {
  searchParams: Promise<{
    type?: string;
    page?: string;
  }>;
};

export default async function MovementsPage({ searchParams }: MovementsPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const result = await getMovementRegister({
    companyId: session.companyId,
    type: params.type,
    page: params.page,
    pageSize: "25",
  });

  return (
    <ModulePage
      active="treasury"
      description="Registro de movimientos financieros aprobados."
      session={session}
      title="Registro de movimientos"
    >
      <div className="grid gap-5">
        <SectionTabs
          tabs={[
            { href: "/treasury", label: "Saldos actuales" },
            { href: "/treasury/cash-flow", label: "Cash Flow" },
            { href: "/treasury/accounts-payable", label: "Cuentas por pagar" },
            { href: "/treasury/movements", label: "Registro de movimientos", active: true },
          ]}
        />

        <form
          action="/treasury/movements"
          className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[220px_auto] md:items-center"
        >
          <select
            className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            defaultValue={params.type ?? ""}
            name="type"
          >
            <option value="">Todos</option>
            <option value="cobro">Cobros</option>
            <option value="pago">Pagos proveedores</option>
          </select>
          <button className="min-h-11 rounded-md bg-[color:var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[color:var(--accent-strong)]">
            Filtrar
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Entidad</th>
                  <th className="px-4 py-3 font-semibold">Concepto</th>
                  <th className="px-4 py-3 font-semibold">Comprobante</th>
                  <th className="px-4 py-3 text-right font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody>
                {result.data.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={6}>
                      No hay movimientos para este filtro.
                    </td>
                  </tr>
                ) : (
                  result.data.map((item) => (
                    <tr className="border-t border-[color:var(--border)]" key={item.id}>
                      <td className="px-4 py-4">{formatDate(item.date)}</td>
                      <td className="px-4 py-4">{item.type}</td>
                      <td className="px-4 py-4">{item.entityName || "-"}</td>
                      <td className="px-4 py-4">{item.concept || item.notes || "-"}</td>
                      <td className="px-4 py-4">
                        {item.receiptUrl ? (
                          <a className="font-semibold text-[color:var(--accent)]" href={item.receiptUrl} target="_blank">
                            Ver comprobante
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationLinks
            basePath="/treasury/movements"
            extraParams={{ type: params.type ?? "" }}
            page={result.meta.page}
            query=""
            totalPages={result.meta.totalPages}
          />
        </div>
      </div>
    </ModulePage>
  );
}
