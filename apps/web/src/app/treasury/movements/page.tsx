import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { formatCurrency, formatDate } from "@/lib/format";
import { getMovementRegister } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_MOVEMENTS_READ_PERMISSION, ADMIN_TREASURY_READ_PERMISSION } from "@/lib/route-auth";
import { Button } from "@/components/ui";

type MovementsPageProps = {
  searchParams: Promise<{
    type?: string;
    page?: string;
  }>;
};

export default async function MovementsPage({ searchParams }: MovementsPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_MOVEMENTS_READ_PERMISSION, ADMIN_TREASURY_READ_PERMISSION]);
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
      description="Registro de movimientos financieros y auditoria operativa de empleados."
      session={session}
      title="Registro de movimientos"
    >
      <div className="grid gap-5">

        <form
          action="/treasury/movements"
          className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[220px_auto] md:items-center"
        >
          <select
            className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 text-sm outline-none focus:border-[color:var(--accent)]"
            defaultValue={params.type ?? ""}
            name="type"
            suppressHydrationWarning
          >
            <option value="">Todos</option>
            <option value="cobro">Cobros</option>
            <option value="pago">Pagos proveedores</option>
            <option value="auditoria">Auditoria</option>
          </select>
          <Button type="submit">
            Filtrar
          </Button>
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
                      <td className="px-4 py-4 text-right font-mono text-xs">
                        {item.type === "auditoria" ? "-" : formatCurrency(item.amount)}
                      </td>
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
