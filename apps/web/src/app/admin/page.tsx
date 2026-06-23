import { ModulePage } from "@/components/module-page";
import Link from "next/link";
import { listApprovalCenter } from "@/lib/approvals";
import { formatCurrency } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";

export default async function AdminPage() {
  const session = await requireStaffSession();
  const approvals = await listApprovalCenter(session.companyId);

  return (
    <ModulePage
      active="admin"
      description="Administracion operativa: solicitudes, aprobaciones y accesos a modulos sensibles."
      session={session}
      title="Administracion"
    >
      <div className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Solicitudes pendientes</div>
            <div className="mt-2 text-2xl font-semibold">{approvals.meta.total}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Monto en revision</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(approvals.meta.amount)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Cobros por validar</div>
            <div className="mt-2 text-2xl font-semibold">{approvals.meta.collections}</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Link className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 hover:bg-[color:var(--panel-subtle)]" href="/admin/approvals">
            <h2 className="font-semibold">Solicitudes y aprobaciones</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">Bandeja central de ordenes, pagos, facturas y cobros.</p>
          </Link>
          <Link className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 hover:bg-[color:var(--panel-subtle)]" href="/employees">
            <h2 className="font-semibold">Usuarios y permisos</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">Empleados, roles y accesos.</p>
          </Link>
          <Link className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 hover:bg-[color:var(--panel-subtle)]" href="/balance">
            <h2 className="font-semibold">Balance</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">Resultado, sueldos, dividendos y obligaciones.</p>
          </Link>
        </div>
      </div>
    </ModulePage>
  );
}
