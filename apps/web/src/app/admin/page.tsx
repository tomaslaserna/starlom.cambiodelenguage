import { ModulePage } from "@/components/module-page";
import Link from "next/link";
import { redirect } from "next/navigation";
import { approvalCenterAccessForSession, listApprovalCenter } from "@/lib/approvals";
import { formatCurrency } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import {
  ADMIN_BALANCE_READ_PERMISSION,
  REPORTS_READ_PERMISSION,
  sessionAllows,
  sessionCanReadEmployees,
} from "@/lib/route-auth";

export default async function AdminPage() {
  const session = await requireStaffSession();
  const approvalAccess = await approvalCenterAccessForSession(session);
  const [canReadEmployees, canReadBalance] = await Promise.all([
    sessionCanReadEmployees(session),
    sessionAllows(session, [ADMIN_BALANCE_READ_PERMISSION, REPORTS_READ_PERMISSION]),
  ]);
  const canUseApprovals = approvalAccess.collections || approvalAccess.requests;
  if (!canUseApprovals && !canReadEmployees && !canReadBalance) redirect("/");
  const approvals = await listApprovalCenter(session.companyId, approvalAccess);

  return (
    <ModulePage
      active="admin"
      description="Administracion operativa: solicitudes, aprobaciones y accesos a modulos sensibles."
      session={session}
      title="Administracion"
    >
      <div className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-(--border) bg-(--panel) p-4">
            <div className="text-sm text-(--muted)">Solicitudes pendientes</div>
            <div className="mt-2 text-2xl font-semibold">{approvals.meta.total}</div>
          </div>
          <div className="rounded-lg border border-(--border) bg-(--panel) p-4">
            <div className="text-sm text-(--muted)">Monto en revision</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(approvals.meta.amount)}</div>
          </div>
          <div className="rounded-lg border border-(--border) bg-(--panel) p-4">
            <div className="text-sm text-(--muted)">Cobros por validar</div>
            <div className="mt-2 text-2xl font-semibold">{approvals.meta.collections}</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {canUseApprovals ? (
            <Link className="rounded-lg border border-(--border) bg-(--panel) p-4 hover:bg-(--panel-subtle)" href="/admin/approvals">
              <h2 className="font-semibold">Solicitudes y aprobaciones</h2>
              <p className="mt-2 text-sm text-(--muted)">Bandeja central de ordenes, pagos, facturas y cobros.</p>
            </Link>
          ) : null}
          {canReadEmployees ? (
            <Link className="rounded-lg border border-(--border) bg-(--panel) p-4 hover:bg-(--panel-subtle)" href="/employees">
              <h2 className="font-semibold">Usuarios y permisos</h2>
              <p className="mt-2 text-sm text-(--muted)">Empleados, roles y accesos.</p>
            </Link>
          ) : null}
          {canReadBalance ? (
          <Link className="rounded-lg border border-(--border) bg-(--panel) p-4 hover:bg-(--panel-subtle)" href="/balance">
            <h2 className="font-semibold">Balance</h2>
            <p className="mt-2 text-sm text-(--muted)">Resultado, sueldos, dividendos y obligaciones.</p>
          </Link>
          ) : null}
        </div>
      </div>
    </ModulePage>
  );
}
