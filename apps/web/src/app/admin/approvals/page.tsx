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
  Input,
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  approvalCenterAccessForSession,
  canOperateApprovalSource,
  listApprovalCenter,
  type ApprovalSource,
} from "@/lib/approvals";
import { requireStaffSession } from "@/lib/auth";
import { approveApprovalAction, rejectApprovalAction } from "@/app/admin/approvals/actions";

function sourceLabel(source: ApprovalSource) {
  return source === "collection" ? "Cobro" : "Solicitud interna";
}

function sourceTone(source: ApprovalSource): StatusBadgeTone {
  return source === "collection" ? "accent" : "info";
}

export default async function ApprovalsPage() {
  const session = await requireStaffSession();
  const approvalAccess = await approvalCenterAccessForSession(session);
  const approvals = await listApprovalCenter(session.companyId, approvalAccess);

  return (
    <ModulePage
      active="admin"
      description="Bandeja unica para solicitudes de compra, pago, factura y aprobacion de cobros."
      session={session}
      title="Solicitudes y aprobaciones"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Gestion de solicitudes pendientes antes de aprobar cobros, compras, pagos o resoluciones internas."
          title="Solicitudes y aprobaciones"
        />

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard className="p-3" label="Pendientes" value={approvals.meta.total} />
          <StatCard className="p-3" label="Cobros" value={approvals.meta.collections} />
          <StatCard className="p-3" label="Solicitudes internas" value={approvals.meta.requests} />
          <StatCard className="p-3" label="Monto en revision" value={formatCurrency(approvals.meta.amount)} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Solicitudes pendientes de aprobacion"
            className="rounded-none border-0 shadow-none"
            minWidth="1080px"
            tableLabel="Solicitudes y aprobaciones"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Tipo</DataTableHead>
                <DataTableHead>Solicitud</DataTableHead>
                <DataTableHead>Solicitante</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead align="right">Monto</DataTableHead>
                <DataTableHead>Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {approvals.items.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState
                      description="Las solicitudes nuevas apareceran aca cuando requieran revision administrativa."
                      title="No hay solicitudes pendientes"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                approvals.items.map((item) => {
                  const reasonInputId = `approval-${item.source}-${item.id}-reason`;
                  const canOperateItem = canOperateApprovalSource(approvalAccess, item.source);

                  return (
                    <DataTableRow key={`${item.source}-${item.id}`}>
                      <DataTableCell>
                        <StatusBadge tone={sourceTone(item.source)}>{sourceLabel(item.source)}</StatusBadge>
                        <div className="mt-2 max-w-[220px] text-xs leading-5 text-[color:var(--muted)]">
                          {item.type || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-1 max-w-[320px] text-xs leading-5 text-[color:var(--muted)]">
                          {item.detail || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell>{item.requester || "-"}</DataTableCell>
                      <DataTableCell className="whitespace-nowrap">{formatDate(item.createdAt)}</DataTableCell>
                      <DataTableCell>
                        <StatusBadge tone="warning">Pendiente</StatusBadge>
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(item.amount)}
                      </DataTableCell>
                      <DataTableCell>
                        {canOperateItem ? (
                          <div className="grid min-w-[300px] gap-2">
                            <form action={approveApprovalAction}>
                              <input name="id" type="hidden" value={item.id} />
                              <input name="source" type="hidden" value={item.source} />
                              <Button
                                aria-label={`Aprobar solicitud ${item.id}`}
                                className="w-full text-xs"
                                size="sm"
                                type="submit"
                              >
                                Aprobar
                              </Button>
                            </form>
                            <form action={rejectApprovalAction} className="flex min-w-0 gap-2">
                              <input name="id" type="hidden" value={item.id} />
                              <input name="source" type="hidden" value={item.source} />
                              <label className="sr-only" htmlFor={reasonInputId}>
                                Motivo de rechazo de la solicitud {item.id}
                              </label>
                              <Input
                                aria-describedby={`${reasonInputId}-hint`}
                                className="min-h-9 flex-1 px-2 text-xs"
                                id={reasonInputId}
                                name="reason"
                                placeholder="Motivo de rechazo"
                              />
                              <span className="sr-only" id={`${reasonInputId}-hint`}>
                                Este motivo se envia junto con el rechazo de la solicitud.
                              </span>
                              <Button
                                aria-label={`Rechazar solicitud ${item.id}`}
                                className="min-h-9 px-3 text-xs"
                                size="sm"
                                type="submit"
                                variant="outline"
                              >
                                Rechazar
                              </Button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs text-[color:var(--muted)]">Sin permiso</span>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
