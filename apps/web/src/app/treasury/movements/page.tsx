import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { formatCurrency, formatDate } from "@/lib/format";
import { getMovementRegister } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_MOVEMENTS_READ_PERMISSION, ADMIN_TREASURY_READ_PERMISSION } from "@/lib/route-auth";
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

        <Toolbar ariaLabel="Filtros del registro de movimientos">
          <form
            action="/treasury/movements"
            className="grid w-full gap-3 md:grid-cols-[minmax(240px,1fr)_auto_auto] md:items-end"
          >
            <Field htmlFor="movement-type" label="Tipo de movimiento">
              <Select defaultValue={params.type ?? ""} id="movement-type" name="type" suppressHydrationWarning>
                <option value="">Todos</option>
                <option value="cobro">Cobros</option>
                <option value="pago">Pagos proveedores</option>
                <option value="auditoria">Auditoria</option>
              </Select>
            </Field>
            <Button type="submit">Filtrar</Button>
            <ButtonLink href="/treasury/movements" variant="secondary">
              Limpiar
            </ButtonLink>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Registro de movimientos financieros"
            className="rounded-none border-0 shadow-none"
            minWidth="940px"
            tableLabel="Registro de movimientos"
          >
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead>Fecha</DataTableHead>
                  <DataTableHead>Tipo</DataTableHead>
                  <DataTableHead>Entidad</DataTableHead>
                  <DataTableHead>Concepto</DataTableHead>
                  <DataTableHead>Comprobante</DataTableHead>
                  <DataTableHead align="right">Monto</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {result.data.length === 0 ? (
                  <DataTableRow className="hover:bg-transparent">
                    <DataTableCell className="py-8 text-center text-[color:var(--muted)]" colSpan={6}>
                      No hay movimientos para este filtro.
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  result.data.map((item) => (
                    <DataTableRow key={item.id}>
                      <DataTableCell className="whitespace-nowrap">{formatDate(item.date)}</DataTableCell>
                      <DataTableCell>{item.type}</DataTableCell>
                      <DataTableCell>{item.entityName || "-"}</DataTableCell>
                      <DataTableCell>{item.concept || item.notes || "-"}</DataTableCell>
                      <DataTableCell>
                        {item.receiptUrl ? (
                          <a className="font-semibold text-[color:var(--accent)]" href={item.receiptUrl} target="_blank">
                            Ver comprobante
                          </a>
                        ) : (
                          "-"
                        )}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {item.type === "auditoria" ? "-" : formatCurrency(item.amount)}
                      </DataTableCell>
                    </DataTableRow>
                  ))
                )}
              </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/treasury/movements"
            extraParams={{ type: params.type ?? "" }}
            page={result.meta.page}
            query=""
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
