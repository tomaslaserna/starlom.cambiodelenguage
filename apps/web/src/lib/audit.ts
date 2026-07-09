import { queryWithCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";

const ACTION_LABELS: Record<string, string> = {
  "purchase.created": "Compra creada",
  "purchase.request_approved": "Solicitud de compra aprobada",
  "purchase.request_rejected": "Solicitud de compra rechazada",
  "purchase.payment_registered": "Pago a proveedor registrado",
  "purchase.payment_requested": "Pago a proveedor solicitado",
  "purchase.package_reviewed": "Paquete de compra revisado",
  "purchase.package_failed": "Paquete de compra con falla",
  "purchase.receipt_uploaded": "Comprobante de compra cargado",
  "collection.approved": "Cobro aprobado",
  "collection.rejected": "Cobro rechazado",
  "fiscal.autorizacion_solicitada": "Autorizacion fiscal solicitada",
  "fiscal.autorizacion_aprobada": "Autorizacion fiscal aprobada",
  "fiscal.autorizacion_rechazada": "Autorizacion fiscal rechazada",
  "fiscal.autorizacion_error": "Autorizacion fiscal con error",
  "fiscal.invoice_approved": "Factura aprobada",
  "fiscal.invoice_rejected": "Factura rechazada",
  "fiscal.invoice_error": "Factura con error",
  "fiscal.credit_note_approved": "Nota de credito aprobada",
  "fiscal.credit_note_error": "Nota de credito con error",
  "fiscal.debit_note_approved": "Nota de debito aprobada",
  "fiscal.debit_note_error": "Nota de debito con error",
};

export function auditActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function summarizeChanges(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" | ");
}

export async function listAuditActions(companyId: number) {
  const result = await queryWithCompanyContext<{ action: string }>(
    companyId,
    `SELECT DISTINCT action FROM audit_log WHERE empresa_id = $1 AND action <> '' ORDER BY action ASC`,
    [companyId],
  );
  return result.rows.map((row) => ({ value: row.action, label: auditActionLabel(row.action) }));
}

export async function listAuditLog(input: {
  companyId: number;
  action?: string | null;
  page?: string | null;
  pageSize?: string | null;
}) {
  const pagination = parsePagination(input);
  const params: unknown[] = [input.companyId];
  const filters = ["a.empresa_id = $1"];

  const action = input.action?.trim() ?? "";
  if (action) {
    params.push(action);
    filters.push(`a.action = $${params.length}`);
  }
  const where = filters.join(" AND ");

  const count = await queryWithCompanyContext<{ total: string }>(
    input.companyId,
    `SELECT COUNT(*)::text AS total FROM audit_log a WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: string;
    actor: string | null;
    action: string;
    entity_table: string;
    entity_id: string;
    new_data: unknown;
    fecha: string | null;
  }>(
    input.companyId,
    `
      SELECT a.id::text AS id,
             COALESCE(p.full_name, p.username, p.email, 'Sistema') AS actor,
             a.action,
             a.entity_table,
             a.entity_id,
             a.new_data,
             a.created_at::text AS fecha
      FROM audit_log a
      LEFT JOIN profiles p ON p.id = a.actor_id
      WHERE ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number(count.rows[0]?.total ?? 0);
  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      actor: row.actor ?? "Sistema",
      action: row.action,
      actionLabel: auditActionLabel(row.action),
      entity: [row.entity_table, row.entity_id].filter(Boolean).join(" "),
      detail: summarizeChanges(row.new_data),
      date: row.fecha,
    })),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}
