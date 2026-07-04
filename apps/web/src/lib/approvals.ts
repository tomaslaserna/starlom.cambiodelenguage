import { normalizeRole, type AuthSession } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { listPendingCollections } from "@/lib/collections";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { executeSupplierPayment, purchaseIdFromParam } from "@/lib/purchases";
import { COLLECTIONS_APPROVE_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";

export const COLLECTION_APPROVAL_PERMISSION = COLLECTIONS_APPROVE_PERMISSION;

export type ApprovalSource = "collection" | "request" | "purchase" | "fiscal";

export type ApprovalCenterAccess = {
  collections: boolean;
  requests: boolean;
  fiscal: boolean;
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

type FiscalApprovalRow = {
  id: string;
  client_name: string;
  client_document: string;
  receipt_number: number | null;
  receipt_type: number | null;
  total_amount: string;
  seller_name: string | null;
  sale_date: string | null;
  fiscal_status: string;
  fiscal_error_message: string;
};

type PurchaseApprovalRow = {
  id: string;
  supplier_name: string;
  description: string;
  total_amount: string;
  purchase_date: string | null;
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

const PURCHASE_REQUEST_TYPE_KEYS = ["solicitud", "solicitud_compra", "solicitud de compra"];

export function parseApprovalSource(value: FormDataEntryValue | null): ApprovalSource {
  if (typeof value !== "string") {
    throw new ApiError(400, "Tipo de solicitud invalido");
  }

  switch (value) {
    case "collection":
      return "collection";
    case "request":
      return "request";
    case "purchase":
      return "purchase";
    case "fiscal":
      return "fiscal";
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
    fiscal: canResolveGenericApproval(session),
  };
}

export function canOperateApprovalSource(access: ApprovalCenterAccess, source: ApprovalSource) {
  switch (source) {
    case "collection":
      return access.collections;
    case "request":
      return access.requests;
    case "purchase":
      return access.requests;
    case "fiscal":
      return access.fiscal;
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

async function listPendingPurchaseApprovals(companyId: number) {
  const result = await queryWithCompanyContext<PurchaseApprovalRow>(
    companyId,
    `
      SELECT p.id::text AS id,
             COALESCE(s.display_name, '') AS supplier_name,
             COALESCE(p.description, '') AS description,
             COALESCE(p.total_amount, 0)::text AS total_amount,
             p.purchase_date::text,
             p.created_at::text
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      WHERE p.empresa_id = $1
        AND p.status = 'pendiente'
        AND LOWER(REPLACE(p.purchase_type, '-', '_')) = ANY($2::text[])
      ORDER BY COALESCE(p.purchase_date, p.created_at::date) DESC, p.created_at DESC
      LIMIT 200
    `,
    [companyId, PURCHASE_REQUEST_TYPE_KEYS],
  );
  return result.rows;
}

async function listPendingFiscalApprovals(companyId: number) {
  const result = await queryWithCompanyContext<FiscalApprovalRow>(
    companyId,
    `
      SELECT s.id::text AS id,
             COALESCE(s.client_name, c.display_name, '') AS client_name,
             COALESCE(s.client_document, c.tax_id, '') AS client_document,
             s.receipt_number,
             s.receipt_type,
             COALESCE(s.total_amount, 0)::text AS total_amount,
             COALESCE(s.seller_name, '') AS seller_name,
             s.sale_date::text,
             COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
             COALESCE(s.fiscal_error_message, '') AS fiscal_error_message
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE s.empresa_id = $1
        AND ${normalizedOrderStatusSql("s")} = 'entregado'
        AND (
          COALESCE(s.desired_document, '') IN ('factura_a', 'factura_b', 'factura_c')
          OR COALESCE(s.receipt_type, 0) IN (1, 6, 11)
        )
        AND COALESCE(s.fiscal_status, 'no_enviado') IN ('no_enviado', 'error')
      ORDER BY s.sale_date DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.id DESC
      LIMIT 200
    `,
    [companyId],
  );
  return result.rows;
}

export async function listApprovalCenter(companyId: number, access: ApprovalCenterAccess) {
  const [collections, requests, purchaseRequests, fiscal] = await Promise.all([
    access.collections ? listPendingCollections(companyId) : Promise.resolve([]),
    access.requests ? listPendingApprovalRequests(companyId) : Promise.resolve([]),
    access.requests ? listPendingPurchaseApprovals(companyId) : Promise.resolve([]),
    access.fiscal ? listPendingFiscalApprovals(companyId) : Promise.resolve([]),
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

  const purchaseRequestItems: ApprovalItem[] = purchaseRequests.map((row) => ({
    id: row.id,
    type: "Solicitud de compra",
    title: `Compra ${row.supplier_name || "sin proveedor"}`,
    detail: row.description || "Solicitud pendiente de revision administrativa.",
    amount: Number(row.total_amount),
    requester: "Compras",
    createdAt: row.purchase_date ?? row.created_at,
    source: "purchase",
  }));

  const fiscalItems: ApprovalItem[] = fiscal.map((row) => ({
    id: row.id,
    type: row.fiscal_status === "error" ? "Factura con error ARCA" : "Factura fiscal pendiente",
    title: `Factura ${row.client_name || "sin cliente"}`,
    detail: [
      row.client_document ? `CUIT/DNI ${row.client_document}` : "",
      row.receipt_number ? `Comp. ${String(row.receipt_number).padStart(8, "0")}` : "Sin numero fiscal",
      row.fiscal_error_message ? `Error: ${row.fiscal_error_message}` : "",
    ]
      .filter(Boolean)
      .join(" - "),
    amount: Number(row.total_amount),
    requester: row.seller_name || "Sistema",
    createdAt: row.sale_date,
    source: "fiscal",
  }));

  const items = [...collectionItems, ...requestItems, ...purchaseRequestItems, ...fiscalItems].sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
  );

  return {
    items,
    meta: {
      total: items.length,
      collections: collectionItems.length,
      requests: requestItems.length,
      purchaseRequests: purchaseRequestItems.length,
      fiscal: fiscalItems.length,
      amount: items.reduce((sum, item) => sum + item.amount, 0),
    },
  };
}

export async function resolvePurchaseApproval(
  session: AuthSession,
  id: string,
  nextState: "aprobada" | "rechazada",
  reason = "",
) {
  if (!canResolveGenericApproval(session)) {
    throw new ApiError(403, "Sin permiso para resolver solicitudes");
  }

  await withCompanyContext(session.companyId, async (client) => {
    const trimmedReason = reason.trim();
    const result = await client.query<{ id: string }>(
      `
        UPDATE purchases
        SET status = $3,
            purchase_type = CASE WHEN $4::text IS NULL THEN purchase_type ELSE $4 END,
            description = CASE
              WHEN $5 = '' THEN description
              ELSE CONCAT_WS(E'\n\n', NULLIF(description, ''), 'Resolucion: ' || $5)
            END,
            updated_at = NOW()
        WHERE id = $1
          AND empresa_id = $2
          AND status = 'pendiente'
          AND LOWER(REPLACE(purchase_type, '-', '_')) = ANY($6::text[])
        RETURNING id
      `,
      [
        id,
        session.companyId,
        nextState === "aprobada" ? "pendiente" : "cancelada",
        nextState === "aprobada" ? "compra" : null,
        trimmedReason,
        PURCHASE_REQUEST_TYPE_KEYS,
      ],
    );

    if (!result.rows[0]) throw new ApiError(404, "Solicitud de compra no encontrada o ya resuelta");

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        nextState === "aprobada" ? "purchase.request_approved" : "purchase.request_rejected",
        "purchases",
        id,
        JSON.stringify({ state: nextState, reason: trimmedReason }),
        session.companyId,
      ],
    );
  });

  clearReadQueryCache();
  return { id, state: nextState };
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
      date: String(metadata.date || localDateIso()),
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
