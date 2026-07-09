import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
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
  EmptyState,
  Field,
  Select,
  Toolbar,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { listAuditActions, listAuditLog } from "@/lib/audit";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_MOVEMENTS_READ_PERMISSION } from "@/lib/route-auth";

type AuditPageProps = {
  searchParams: Promise<{
    action?: string;
    page?: string;
  }>;
};

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_MOVEMENTS_READ_PERMISSION]);
  const params = await searchParams;
  const [result, actions] = await Promise.all([
    listAuditLog({
      companyId: session.companyId,
      action: params.action,
      page: params.page,
      pageSize: "25",
    }),
    listAuditActions(session.companyId),
  ]);

  return (
    <ModulePage
      active="audit"
      description="Registro de movimientos de empleados: quien hizo cada accion, cuando y sobre que."
      session={session}
      title="Auditoria"
    >
      <div className="grid gap-5">
        <Toolbar ariaLabel="Filtro de auditoria">
          <form
            action="/admin/audit"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto] lg:items-end"
          >
            <Field htmlFor="audit-action" label="Accion">
              <Select defaultValue={params.action ?? ""} id="audit-action" name="action">
                <option value="">Todas las acciones</option>
                {actions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Filtrar</Button>
            <ButtonLink href="/admin/audit" variant="secondary">
              Limpiar
            </ButtonLink>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Acciones registradas por los empleados"
            className="rounded-none border-0 shadow-none"
            minWidth="920px"
            tableLabel="Auditoria"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Empleado</DataTableHead>
                <DataTableHead>Accion</DataTableHead>
                <DataTableHead>Entidad</DataTableHead>
                <DataTableHead>Detalle</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState
                      description="Cuando los empleados aprueben, rechacen o registren operaciones, van a aparecer aca."
                      title="No hay movimientos registrados para este filtro"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((entry) => (
                  <DataTableRow key={entry.id}>
                    <DataTableCell className="whitespace-nowrap text-xs">{formatDate(entry.date)}</DataTableCell>
                    <DataTableCell className="font-medium">{entry.actor}</DataTableCell>
                    <DataTableCell>{entry.actionLabel}</DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs text-[color:var(--muted)]">
                      {entry.entity || "-"}
                    </DataTableCell>
                    <DataTableCell className="max-w-[360px] break-words text-xs text-[color:var(--muted)]">
                      {entry.detail || "-"}
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/admin/audit"
            extraParams={{ action: params.action ?? "" }}
            page={result.meta.page}
            query=""
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
