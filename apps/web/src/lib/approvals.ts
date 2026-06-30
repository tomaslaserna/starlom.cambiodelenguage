import { normalizeRole, type AuthSession } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { listPendingCollections } from "@/lib/collections";
import { queryWithCompanyContext } from "@/lib/db";
import { executeSupplierPayment, purchaseIdFromParam } from "@/lib/purchases";
import { COLLECTIONS_APPROVE_PERMISSION, sessionAllows } from "@/lib/route-auth";

export const COLLECTION_APPROVAL_PERMISSION = COLLECTIONS_APPROVE_PERMISSION;

export type ApprovalSource = "collection" | "request";

export type ApprovalCenterAccess = {
  collections: boolean;
  requests: boolean;
};

type ApprovalRequestRow = {
  id: number;
  tipo: string;
  titulo: string;
  detalle: string;
  monto: string;
  solicitante: string;
  created_at: string;
};

export type ApprovalItem = {
  id: string | number;
  type: string;
  title: string;
  detail: string;
  amount: number;
  requester: string;
  createdAt: string | null;
  source: ApprovalSource;
};

export function parseApprovalSource(value: FormDataEntryValue | null): ApprovalSource {
  if (typeof value !== "string") {
    throw new ApiError(400, "Tipo de solicitud invalido");
  }

  switch (value) {
    case "collection":
      return "collection";
    case "request":
      return "request";
    default:
      throw new ApiError(400, "Tipo de solicitud invalido");
  }
}

export function canResolveGenericApproval(session: AuthSession) {
  const role = normalizeRole(session.role);
  return role === "administrador" || role === "jefe";
}

export async function approvalCenterAccessForSession(session: AuthSession): Promise<ApprovalCenterAccess> {
  return {
    collections: await sessionAllows(session, [COLLECTION_APPROVAL_PERMISSION]),
    requests: canResolveGenericApproval(session),
  };
}

export function canOperateApprovalSource(access: ApprovalCenterAccess, source: ApprovalSource) {
  switch (source) {
    case "collection":
      return access.collections;
    case "request":
      return access.requests;
  }
}

async function listPendingApprovalRequests(companyId: number) {
  const result = await queryWithCompanyContext<ApprovalRequestRow>(
    companyId,
    `
      SELECT id, tipo, titulo, detalle, monto::text, solicitante, created_at::text
      FROM app_solicitudes
      WHERE empresa_id = $1 AND estado = 'pendiente'
      ORDER BY created_at DESC, id DESC
    `,
    [companyId],
  );
  return result.rows;
}

export async function listApprovalCenter(companyId: number, access: ApprovalCenterAccess) {
  const [collections, requests] = await Promise.all([
    access.collections ? listPendingCollections(companyId) : Promise.resolve([]),
    access.requests ? listPendingApprovalRequests(companyId) : Promise.resolve([]),
  ]);

  const collectionItems: ApprovalItem[] = collections.map((item) => ({
    id: item.id,
    type: "Solicitud de aprobacion de cobro",
    title: `Cobro ${item.customerName || "sin cliente"}`,
    detail: `${item.method || "Metodo"} - ${item.destination || "sin destino"} - Operacion ${
      item.operation || "-"
    } - Saldo actual ${item.outstandingAmount.toFixed(2)} - Queda ${item.outstandingAfterApproval.toFixed(2)}`,
    amount: item.registeredAmount,
    requester: item.registeredBy,
    createdAt: item.registeredAt,
    source: "collection",
  }));

  const requestItems: ApprovalItem[] = requests.map((row) => ({
    id: row.id,
    type: row.tipo,
    title: row.titulo || row.tipo,
    detail: row.detalle,
    amount: Number(row.monto),
    requester: row.solicitante,
    createdAt: row.created_at,
    source: "request",
  }));

  const items = [...collectionItems, ...requestItems].sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  );

  return {
    items,
    meta: {
      total: items.length,
      collections: collectionItems.length,
      requests: requestItems.length,
      amount: items.reduce((sum, item) => sum + item.amount, 0),
    },
  };
}

export async function resolveGenericApproval(
  session: AuthSession,
  id: number,
  nextState: "aprobada" | "rechazada",
  reason = "",
) {
  if (!canResolveGenericApproval(session)) {
    throw new ApiError(403, "Sin permiso para resolver solicitudes");
  }

  const request = await queryWithCompanyContext<{
    id: number;
    tipo: string;
    metadata: Record<string, unknown> | string;
  }>(
    session.companyId,
    `
      SELECT id, tipo, metadata
      FROM app_solicitudes
      WHERE id = $1 AND empresa_id = $2 AND estado = 'pendiente'
      LIMIT 1
    `,
    [id, session.companyId],
  );
  const row = request.rows[0];
  if (!row) throw new ApiError(404, "Solicitud no encontrada o ya resuelta");

  const metadata =
    typeof row.metadata === "string"
      ? (JSON.parse(row.metadata || "{}") as Record<string, unknown>)
      : row.metadata;

  if (nextState === "aprobada" && metadata.action === "supplier_payment") {
    await executeSupplierPayment(session, purchaseIdFromParam(String(metadata.purchaseId ?? ""), "Compra"), {
      amount: Number(metadata.amount),
      date: String(metadata.date || new Date().toISOString().slice(0, 10)),
      notes: String(metadata.notes || ""),
    });
  }

  const result = await queryWithCompanyContext<{ id: number }>(
    session.companyId,
    `
      UPDATE app_solicitudes
      SET estado = $1,
          detalle = CASE WHEN $2 = '' THEN detalle ELSE detalle || E'\n\nResolucion: ' || $2 END,
          resuelto_por = $3,
          resuelto_at = NOW(),
          updated_at = NOW()
      WHERE id = $4 AND empresa_id = $5 AND estado = 'pendiente'
      RETURNING id
    `,
    [nextState, reason.trim(), session.username, id, session.companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Solicitud no encontrada o ya resuelta");
  return { id, state: nextState };
}
