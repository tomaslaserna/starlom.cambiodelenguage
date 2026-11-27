import { randomUUID } from "node:crypto";
import type { AuthSession } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { getArcaConfig } from "@/lib/arca/config";
import {
  authorizeReservedInvoice,
  withInvoiceLock,
} from "@/lib/arca/invoice-attempt";
import {
  receiptTypeForArcaVatCondition,
  consultArcaAuthorizedReceipt,
} from "@/lib/arca/wsfe";
import {
  runReissue,
  validateReissueSnapshot,
  type ReissueRecord,
  type ReissueSnapshot,
} from "@/lib/fiscal-reissue-domain";
import {
  assertReissuableOrder,
  requireCompatibleTargetCondition,
  validateOriginalFiscalReceipt,
} from "@/lib/fiscal-reissue-validation";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import {
  netReplacement,
  type OperationalReturn,
} from "@/lib/fiscal-reissue-returns";
export type FiscalReissue = ReissueRecord & { id: string; saleId: string };
const columns =
  'id::text, sale_id::text AS "saleId", snapshot, reason, credit_id::text AS "creditId", invoice_id::text AS "invoiceId", state, credit, invoice, error';
export async function getFiscalReissue(companyId: number, saleId: string) {
  return (
    (
      await queryWithCompanyContext<FiscalReissue>(
        companyId,
        `SELECT ${columns} FROM starlim_arca.reissues WHERE company_id=$1 AND sale_id=$2::uuid`,
        [companyId, saleId],
        { cache: false },
      )
    ).rows[0] ?? null
  );
}
export async function assertSaleNotReissued(companyId: number, saleId: string) {
  if (await getFiscalReissue(companyId, saleId))
    throw new ApiError(
      409,
      "La factura tiene una refacturación fiscal. Consultá el expediente antes de emitir otros ajustes.",
    );
}
export async function previewFiscalReissue(
  companyId: number,
  saleId: string,
  originalName?: string,
  netReturns = false,
): Promise<ReissueSnapshot> {
  const existing = await getFiscalReissue(companyId, saleId);
  if (existing) return existing.snapshot;
  const result = await queryWithCompanyContext<{
    client_id: string;
    source_name: string;
    source_document: string;
    total: string;
    vat: string;
    point: number;
    kind: number;
    number: number;
    cae: string;
    expiry: string;
    issue_date: string;
    payment_condition: string;
    target_name: string;
    target_document: string;
    target_condition: string;
    target_address: string;
    adjusted: boolean;
    approved: boolean;
    order_status: string;
  }>(
    companyId,
    `SELECT s.client_id::text, COALESCE(s.client_name,'') AS source_name, COALESCE(s.client_document,'') AS source_document,
    s.total_amount::text AS total,s.fiscal_vat_rate::text AS vat,s.fiscal_point_of_sale AS point,s.fiscal_receipt_type AS kind,s.fiscal_receipt_number AS number,
    s.cae,s.cae_expires_at::text AS expiry,COALESCE(s.fiscal_issue_date,s.sale_date)::text AS issue_date,COALESCE(s.payment_condition,'') AS payment_condition,
    COALESCE(NULLIF(btrim(c.legal_name),''),c.display_name,'') AS target_name,COALESCE(c.tax_id,'') AS target_document,
    COALESCE(c.fiscal_condition,'') AS target_condition,COALESCE(c.address,'') AS target_address,
    (s.fiscal_status='aprobado' AND COALESCE(s.cae,'') NOT IN ('','manual')) AS approved,
    ${normalizedOrderStatusSql("s")} AS order_status,
    EXISTS(SELECT 1 FROM sales_internal_documents d WHERE d.empresa_id=s.empresa_id AND d.sale_id=s.id AND d.class_name IN ('NC','ND')) AS adjusted
    FROM sales s JOIN clients c ON c.id=s.client_id AND c.empresa_id=s.empresa_id WHERE s.empresa_id=$1 AND s.id=$2::uuid`,
    [companyId, saleId],
    { cache: false },
  );
  const s = result.rows[0];
  if (!s) throw new ApiError(404, "Factura no encontrada en esta empresa.");
  assertReissuableOrder(s.order_status);
  if (!s.approved || (s.adjusted && !netReturns))
    throw new ApiError(
      409,
      "Se requiere una factura aprobada sin ajustes previos, o la conciliación explícita de devoluciones internas.",
    );
  const detail = await queryWithCompanyContext<{
    id: string | null;
    code: string;
    name: string;
    quantity: string;
    unit_price: string;
    amount: string;
  }>(
    companyId,
    `SELECT si.product_id::text AS id,COALESCE(p.sku,'') AS code,COALESCE(NULLIF(si.description,''),p.name,'') AS name,
    si.quantity::text,si.unit_price::text,COALESCE(si.total_amount,si.quantity*si.unit_price)::text AS amount
    FROM sale_items si LEFT JOIN products p ON p.id=si.product_id AND p.empresa_id=si.empresa_id
    WHERE si.empresa_id=$1 AND si.sale_id=$2::uuid ORDER BY si.id`,
    [companyId, saleId],
    { cache: false },
  );
  const snapshot: ReissueSnapshot = {
    saleId,
    clientId: s.client_id,
    total: Number(s.total),
    vatRate: Number(s.vat),
    source: {
      name: originalName?.trim() || s.source_name,
      document: s.source_document.replace(/\D/g, ""),
      condition: "Responsable Inscripto",
      address: "",
    },
    target: {
      name: s.target_name,
      document: s.target_document.replace(/\D/g, ""),
      condition: s.target_condition,
      address: s.target_address,
    },
    original: {
      pointOfSale: s.point,
      receiptType: s.kind,
      receiptNumber: s.number,
      cae: s.cae,
      caeExpiresAt: s.expiry,
      issueDate: s.issue_date,
      observations: [],
    },
    items: detail.rows.map((i) => ({
      id: i.id ?? undefined,
      code: i.code,
      name: i.name,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      amount: Number(i.amount),
    })),
    paymentCondition: s.payment_condition,
  };
  if (netReturns) {
    const returns = await queryWithCompanyContext<OperationalReturn>(
      companyId,
      `SELECT id::text,amount::float8,detail_json AS detail,account_adjusted AS "accountAdjusted",stock_adjusted AS "stockAdjusted",fiscal,class_name AS "className"
      FROM sales_internal_documents WHERE empresa_id=$1 AND sale_id=$2::uuid AND class_name IN ('NC','ND') ORDER BY id`,
      [companyId, saleId],
      { cache: false },
    );
    Object.assign(snapshot, netReplacement(snapshot, returns.rows));
  }
  validateReissueSnapshot(snapshot);
  requireCompatibleTargetCondition(snapshot.target.condition);
  if (receiptTypeForArcaVatCondition(snapshot.target.condition, 1) !== 1)
    throw new ApiError(
      409,
      "La nueva condición fiscal no admite el mismo tipo A.",
    );
  const config = getArcaConfig();
  if (config.pointOfSale !== snapshot.original.pointOfSale)
    throw new ApiError(409, "La factura pertenece a otro punto de venta.");
  snapshot.source.condition = validateOriginalFiscalReceipt(
    snapshot,
    await consultArcaAuthorizedReceipt(
      snapshot.original.receiptType,
      snapshot.original.receiptNumber,
    ),
  );
  return snapshot;
}
export async function executeFiscalReissue(
  session: AuthSession,
  saleId: string,
  reason: string,
  originalName: string,
  expectedFingerprint: string,
  netReturns = false,
) {
  // Same issuer-wide lock as ordinary invoices; held through both durable stages.
  return withInvoiceLock(async () => {
    let record = await getFiscalReissue(session.companyId, saleId);
    if (!record) {
      if (!reason.trim() || reason.trim().length > 500 || !originalName.trim())
        throw new ApiError(
          400,
          "Confirmá la razón social original y el motivo (máximo 500 caracteres).",
        );
      const snapshot = await previewFiscalReissue(
        session.companyId,
        saleId,
        originalName,
        netReturns,
      );
      if (reissueFingerprint(snapshot) !== expectedFingerprint)
        throw new ApiError(
          409,
          "Los datos cambiaron desde la vista previa. Volvé a revisar antes de emitir.",
        );
      const config = getArcaConfig();
      if (config.pointOfSale !== snapshot.original.pointOfSale)
        throw new ApiError(409, "La factura pertenece a otro punto de venta.");
      // ARCA identity is checked before cancelling any invoice. No fallback to current customer data.
      const remote = await consultArcaAuthorizedReceipt(
        snapshot.original.receiptType,
        snapshot.original.receiptNumber,
      );
      if (
        validateOriginalFiscalReceipt(snapshot, remote) !==
        snapshot.source.condition
      )
        throw new ApiError(
          409,
          "La condición fiscal original cambió durante la verificación.",
        );
      record = await withCompanyContext(session.companyId, async (db) => {
        // Serialize with commercial-note creation and freeze all data in one committed record.
        await db.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,173))",
          [`${session.companyId}:${saleId}`],
        );
        const inserted = await db.query<FiscalReissue>(
          `INSERT INTO starlim_arca.reissues(company_id,sale_id,snapshot,reason,created_by,credit_id,invoice_id)
          VALUES($1,$2::uuid,$3::jsonb,$4,$5::uuid,$6::uuid,$7::uuid) RETURNING ${columns}`,
          [
            session.companyId,
            saleId,
            JSON.stringify(snapshot),
            reason.trim(),
            session.userId,
            randomUUID(),
            randomUUID(),
          ],
        );
        return inserted.rows[0];
      });
    }
    const save = async (change: Partial<ReissueRecord>) => {
      const result = await queryWithCompanyContext<FiscalReissue>(
        session.companyId,
        `UPDATE starlim_arca.reissues SET state=$3,
        credit=COALESCE($4::jsonb,credit),invoice=COALESCE($5::jsonb,invoice),error=$6,updated_at=now()
        WHERE company_id=$1 AND sale_id=$2::uuid RETURNING ${columns}`,
        [
          session.companyId,
          saleId,
          change.state,
          change.credit ? JSON.stringify(change.credit) : null,
          change.invoice ? JSON.stringify(change.invoice) : null,
          change.error ?? "",
        ],
      );
      if (!result.rows[0])
        throw new ApiError(409, "No se pudo guardar el estado fiscal.");
      return result.rows[0];
    };
    return runReissue(record, save, async (kind, r) => {
      const party = kind === "credit" ? r.snapshot.source : r.snapshot.target;
      return authorizeReservedInvoice(
        session.companyId,
        kind === "credit" ? r.creditId : r.invoiceId,
        false,
        {
          customerDocument: party.document,
          customerVatCondition: party.condition,
          receiptType: kind === "credit" ? 3 : 1,
          totalAmount:
            kind === "credit"
              ? r.snapshot.total
              : (r.snapshot.replacementTotal ?? r.snapshot.total),
          vatRate: r.snapshot.vatRate,
          preserveReceiptType: true,
          associatedReceipt:
            kind === "credit"
              ? {
                  pointOfSale: r.snapshot.original.pointOfSale,
                  receiptType: r.snapshot.original.receiptType,
                  receiptNumber: r.snapshot.original.receiptNumber,
                }
              : undefined,
        },
        true,
      );
    });
  });
}
// Fingerprint is a stale-preview guard, not authorization; every action still authenticates and revalidates.
import { createHash } from "node:crypto";
export function reissueFingerprint(snapshot: ReissueSnapshot) {
  // Original legal name is explicitly confirmed in the form for legacy invoices
  // that stored only the trading name. CUIT and every other fiscal value are fixed.
  return createHash("sha256")
    .update(
      JSON.stringify({ ...snapshot, source: { ...snapshot.source, name: "" } }),
    )
    .digest("hex");
}

export async function listFiscalReissues(companyId: number, saleIds: string[]) {
  if (!saleIds.length) return [];
  return (
    await queryWithCompanyContext<FiscalReissue>(
      companyId,
      `SELECT ${columns} FROM starlim_arca.reissues WHERE company_id=$1 AND sale_id=ANY($2::uuid[])`,
      [companyId, saleIds],
      { cache: false },
    )
  ).rows;
}
