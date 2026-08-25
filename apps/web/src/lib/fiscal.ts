import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { arcaMissingEnv, getArcaConfig } from "@/lib/arca/config";
import {
  authorizeArcaInvoice,
  findLastArcaAuthorizedReceipt,
  receiptTypeForArcaVatCondition,
  type ArcaAuthorizedReceipt,
} from "@/lib/arca/wsfe";
import { hasCompleteFiscalData } from "@/lib/client-fiscal";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { invoiceSaleOrderDocument, normalizeDesiredDocument, receiptTypeCode } from "@/lib/receipt-types";
import { isFinalTotalConsistent, isSaleVatRate } from "@/lib/vat-calculation";
import { localDateIso } from "@/lib/timezone";

export type FiscalProviderName = "disabled" | "arca";
export type FiscalEnvironmentMode = "disabled" | "testing" | "production";
export type FiscalDocumentSource = "sale" | "remittance" | "sales_document";
export type FiscalDocumentKind = "invoice" | "credit_note" | "debit_note";
export type FiscalAuthorizationStatus = "no_enviado" | "pendiente" | "aprobado" | "rechazado" | "error";

export type FiscalStatus = {
  provider: FiscalProviderName;
  enabled: boolean;
  ready: boolean;
  mode: FiscalEnvironmentMode;
  message: string;
  missingEnv: string[];
  pointOfSale?: number;
};

export type FiscalAuthorizationInput = {
  companyId: number;
  userId: string;
  username: string;
  documentId: string;
  source: FiscalDocumentSource;
  kind: FiscalDocumentKind;
  receiptType: number;
  receiptNumber: number;
  totalAmount: number;
  vatRate: number;
  customerName: string;
  customerDocument: string;
  customerFiscalCondition: string;
  preserveReceiptType?: boolean;
  associatedReceipt?: {
    pointOfSale: number;
    receiptType: number;
    receiptNumber: number;
  };
};

export type FiscalAuthorizationResult = {
  documentId: string;
  pointOfSale: number;
  receiptType: number;
  receiptNumber: number;
  issueDate?: string;
  cae: string;
  caeExpiresAt: string;
  observations?: Array<{ code: string; message: string; source: string }>;
};

type FiscalProvider = {
  name: FiscalProviderName;
  status(): FiscalStatus;
  authorizeDocument(input: FiscalAuthorizationInput): Promise<FiscalAuthorizationResult>;
};

const INVOICE_RECEIPT_TYPES = new Set([1, 6, 11]);
const CREDIT_NOTE_BY_INVOICE_RECEIPT_TYPE = new Map([
  [1, 3],
  [6, 8],
  [11, 13],
]);
const DEBIT_NOTE_BY_INVOICE_RECEIPT_TYPE = new Map([
  [1, 2],
  [6, 7],
  [11, 12],
]);
const VAT_DISCRIMINATING_RECEIPT_TYPES = new Set([1, 2, 3, 6, 7, 8]);

function assertFiscalVatRate(receiptType: number, vatRate: number) {
  if (VAT_DISCRIMINATING_RECEIPT_TYPES.has(receiptType) && vatRate !== 21) {
    throw new ApiError(
      409,
      "La Factura o Nota A/B requiere la alicuota IVA 21% persistida. No se emitio el comprobante ni se reinterpretaron datos historicos.",
    );
  }
}

function fiscalVatRateSnapshot(receiptType: number, vatRate: number) {
  return VAT_DISCRIMINATING_RECEIPT_TYPES.has(receiptType) && vatRate === 21 ? 21 : 0;
}

function assertSaleFinalTotal(sale: Pick<SaleFiscalCandidate, "totalAmount" | "itemNetAmount" | "vatRate">) {
  if (isSaleVatRate(sale.vatRate) && !isFinalTotalConsistent(sale.totalAmount, sale.itemNetAmount, sale.vatRate)) {
    throw new ApiError(
      409,
      "El total almacenado no coincide con los renglones netos mas el IVA seleccionado. No se emitio el comprobante para evitar alterar una venta historica.",
    );
  }
}

type SaleFiscalCandidate = {
  id: string;
  clientId: string | null;
  receiptType: number;
  receiptNumber: number;
  totalAmount: number;
  vatRate: number;
  fiscalVatRate: number | null;
  itemNetAmount: number;
  customerName: string;
  customerDocument: string;
  customerFiscalCondition: string;
  orderStatus: string;
  desiredDocument: string;
  fiscalStatus: FiscalAuthorizationStatus;
  cae: string;
  fiscalPointOfSale: number | null;
  fiscalReceiptType: number | null;
  fiscalReceiptNumber: number | null;
  hasItemDetail: boolean;
  fiscalErrorMessage: string;
};

export type SaleCreditNotePreview = {
  saleId: string;
  saleNumber: string;
  customerName: string;
  customerDocument: string;
  totalAmount: number;
  invoiceReceipt: string;
  invoiceReceiptType: number;
  invoicePointOfSale: number;
  invoiceReceiptNumber: number;
  invoiceCae: string;
  creditNoteReceiptType: number;
  creditNoteStatus: FiscalAuthorizationStatus | "";
  creditNoteReceipt: string;
  creditNoteCae: string;
  creditNoteErrorMessage: string;
  operationalDocumentId: string;
  operationalAmount: number | null;
  operationalReason: string;
};

function selectedProviderName(): FiscalProviderName {
  const value = (process.env.STARLIM_FISCAL_PROVIDER ?? "disabled").trim().toLowerCase();
  return value === "arca" ? "arca" : "disabled";
}

function selectedMode(): FiscalEnvironmentMode {
  const value = (process.env.STARLIM_FISCAL_MODE ?? "disabled").trim().toLowerCase();
  if (value === "testing" || value === "production") return value;
  return "disabled";
}

export function fiscalUnavailable(message = "La facturacion fiscal ARCA esta deshabilitada.") {
  return new ApiError(410, message);
}

class DisabledFiscalProvider implements FiscalProvider {
  name: FiscalProviderName = "disabled";

  status(): FiscalStatus {
    return {
      provider: this.name,
      enabled: false,
      ready: false,
      mode: "disabled",
      message:
        "Modulo fiscal deshabilitado. Las ventas y notas internas pueden operar sin emitir CAE.",
      missingEnv: [],
    };
  }

  async authorizeDocument(): Promise<FiscalAuthorizationResult> {
    throw fiscalUnavailable();
  }
}

class ArcaFiscalProvider implements FiscalProvider {
  name: FiscalProviderName = "arca";

  status(): FiscalStatus {
    const missingEnv = arcaMissingEnv();
    let pointOfSale: number | undefined;
    let ready = false;
    let message = "ARCA configurado. Las facturas se autorizan por WSAA/WSFEv1 desde Solicitudes y aprobaciones.";

    if (missingEnv.length === 0) {
      try {
        pointOfSale = getArcaConfig().pointOfSale;
        ready = true;
      } catch (error) {
        message = error instanceof Error ? error.message : "ARCA no esta listo.";
      }
    } else {
      message = "ARCA no esta listo: faltan variables privadas de certificado, CUIT o punto de venta.";
    }

    return {
      provider: this.name,
      enabled: true,
      ready,
      mode: selectedMode(),
      message,
      missingEnv,
      pointOfSale,
    };
  }

  async authorizeDocument(input: FiscalAuthorizationInput): Promise<FiscalAuthorizationResult> {
    const result = await authorizeArcaInvoice({
      customerDocument: input.customerDocument,
      customerVatCondition: input.customerFiscalCondition,
      receiptType: input.receiptType,
      totalAmount: input.totalAmount,
      vatRate: input.vatRate,
      preserveReceiptType: input.preserveReceiptType,
      associatedReceipt: input.associatedReceipt,
    });

    return {
      documentId: input.documentId,
      pointOfSale: result.pointOfSale,
      receiptType: result.receiptType,
      receiptNumber: result.receiptNumber,
      issueDate: result.issueDate,
      cae: result.cae,
      caeExpiresAt: result.caeExpiresAt,
      observations: result.observations,
    };
  }
}

export function getFiscalProvider(): FiscalProvider {
  return selectedProviderName() === "arca"
    ? new ArcaFiscalProvider()
    : new DisabledFiscalProvider();
}

export function getFiscalStatus() {
  return getFiscalProvider().status();
}

export function fiscalStatusLabel(value: string) {
  const labels: Record<FiscalAuthorizationStatus, string> = {
    no_enviado: "No enviado",
    pendiente: "Pendiente",
    aprobado: "Aprobado",
    rechazado: "Rechazado",
    error: "Error",
  };
  return labels[value as FiscalAuthorizationStatus] ?? "No enviado";
}

export function isFiscalApproved(status: string, cae: string) {
  return status === "aprobado" && cae.trim() !== "";
}

// Crea una solicitud de factura para un pedido entregado. La emisión real contra ARCA
// ocurre recién al aprobarla en Solicitudes y aprobaciones (ver resolveGenericApproval).
// Idempotente: no inserta si ya hay una solicitud fiscal pendiente para ese pedido.
export async function requestSaleFiscalInvoice(session: AuthSession, saleId: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const saleResult = await client.query<{
      order_status: string;
      fiscal_status: string;
      cae: string;
      total_amount: string;
      client_name: string;
      tax_id: string;
      fiscal_condition: string;
    }>(
      `
        SELECT ${normalizedOrderStatusSql("s")} AS order_status,
               COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
               COALESCE(s.cae, '') AS cae,
               COALESCE(s.total_amount, 0)::text AS total_amount,
               COALESCE(s.client_name, c.display_name, '') AS client_name,
               COALESCE(s.client_document, c.tax_id, '') AS tax_id,
               COALESCE(c.fiscal_condition, '') AS fiscal_condition
        FROM sales s
        LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        WHERE s.id = $1::uuid AND s.empresa_id = $2
        LIMIT 1
      `,
      [saleId, session.companyId],
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new ApiError(404, "Pedido no encontrado");
    if (sale.order_status !== "entregado") {
      throw new ApiError(409, "Solo se puede solicitar factura de un pedido entregado");
    }
    if (!hasCompleteFiscalData({ taxId: sale.tax_id, fiscalCondition: sale.fiscal_condition })) {
      throw new ApiError(400, "El cliente no tiene datos fiscales completos para facturar");
    }
    if (isFiscalApproved(sale.fiscal_status, sale.cae)) {
      throw new ApiError(409, "La venta ya tiene factura fiscal aprobada");
    }

    const metadata = { action: "fiscal_invoice", saleId };
    const request = await client.query<{ id: string }>(
      `
        INSERT INTO app_solicitudes (
          tipo, titulo, detalle, monto, solicitante, estado, metadata, empresa_id
        )
        SELECT 'factura', $3, $4, $5, $6, 'pendiente', $7::jsonb, $2
        WHERE NOT EXISTS (
          SELECT 1
          FROM app_solicitudes
          WHERE empresa_id = $2
            AND estado = 'pendiente'
            AND metadata->>'action' = 'fiscal_invoice'
            AND metadata->>'saleId' = $1
        )
        RETURNING id::text AS id
      `,
      [
        saleId,
        session.companyId,
        `Factura ${sale.client_name || "sin cliente"}`,
        `Pedido ${saleId} - Cliente ${sale.client_name || "sin cliente"}`,
        Number(sale.total_amount),
        session.username,
        JSON.stringify(metadata),
      ],
    );
    if (!request.rows[0]) {
      throw new ApiError(409, "Ya existe una solicitud de factura pendiente para este pedido");
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        "fiscal.invoice_requested",
        "sales",
        saleId,
        JSON.stringify({ requestId: request.rows[0].id }),
        session.companyId,
      ],
    );

    return { id: request.rows[0].id, saleId };
  });

  clearReadQueryCache();
  return result;
}

export async function requestSaleFiscalNote(session: AuthSession, saleId: string, operationalDocumentId: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const noteResult = await client.query<{
      class_name: "NC" | "ND";
      amount: string;
      reason: string;
      client_name: string;
      fiscal_status: FiscalAuthorizationStatus;
      cae: string;
    }>(
      `
        SELECT note.class_name, note.amount::text, COALESCE(note.reason, '') AS reason,
               COALESCE(s.client_name, c.display_name, '') AS client_name,
               COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
               COALESCE(s.cae, '') AS cae
        FROM sales_internal_documents note
        JOIN sales s ON s.id = note.sale_id AND s.empresa_id = note.empresa_id
        LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        WHERE note.id = $1::uuid AND note.empresa_id = $2
          AND note.sale_id = $3::uuid AND note.fiscal = false
          AND note.class_name IN ('NC', 'ND')
        LIMIT 1
      `,
      [operationalDocumentId, session.companyId, saleId],
    );
    const note = noteResult.rows[0];
    if (!note) throw new ApiError(404, "La nota operativa no existe o no pertenece a esta venta.");
    if (!isFiscalApproved(note.fiscal_status, note.cae)) {
      throw new ApiError(409, "Primero debe existir una factura aprobada con CAE para esta venta.");
    }

    const metadata = {
      action: "fiscal_note",
      saleId,
      operationalDocumentId,
      kind: note.class_name === "NC" ? "credit_note" : "debit_note",
    };
    const request = await client.query<{ id: string }>(
      `
        INSERT INTO app_solicitudes (tipo, titulo, detalle, monto, solicitante, estado, metadata, empresa_id)
        SELECT 'factura', $4, $5, $6::numeric, $7, 'pendiente', $8::jsonb, $2
        WHERE NOT EXISTS (
          SELECT 1 FROM app_solicitudes
          WHERE empresa_id = $2 AND estado = 'pendiente'
            AND metadata->>'action' = 'fiscal_note'
            AND metadata->>'operationalDocumentId' = $1
        )
        RETURNING id::text
      `,
      [
        operationalDocumentId,
        session.companyId,
        saleId,
        `${note.class_name} fiscal · ${note.client_name}`,
        `${note.class_name} operativa vinculada a la venta. ${note.reason}`.trim(),
        Number(note.amount),
        session.username,
        JSON.stringify(metadata),
      ],
    );
    if (!request.rows[0]) throw new ApiError(409, "Ya existe una solicitud fiscal pendiente para esta nota.");
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        "fiscal.note_requested",
        "sales_internal_documents",
        operationalDocumentId,
        JSON.stringify({ requestId: request.rows[0].id, ...metadata }),
        session.companyId,
      ],
    );
    return { id: request.rows[0].id };
  });
  clearReadQueryCache();
  return result;
}

function fiscalErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Error desconocido al autorizar el comprobante fiscal";
}

function fiscalFailureStatus(error: unknown): Exclude<FiscalAuthorizationStatus, "no_enviado" | "pendiente" | "aprobado"> {
  if (error instanceof ApiError && error.status === 410) return "rechazado";
  return "error";
}

function invoiceReceiptTypeFromSale(sale: SaleFiscalCandidate) {
  if (INVOICE_RECEIPT_TYPES.has(sale.receiptType)) return sale.receiptType;
  const desired = normalizeDesiredDocument(sale.desiredDocument);
  const receiptType = receiptTypeCode(desired);
  if (INVOICE_RECEIPT_TYPES.has(receiptType)) return receiptType;
  return receiptTypeCode(invoiceSaleOrderDocument(sale.customerFiscalCondition));
}

function fiscalNoteClass(kind: Exclude<FiscalDocumentKind, "invoice">) {
  return kind === "credit_note" ? "NC" : "ND";
}

function fiscalNoteLabel(kind: Exclude<FiscalDocumentKind, "invoice">) {
  return kind === "credit_note" ? "nota de credito" : "nota de debito";
}

function fiscalNoteReceiptTypeForInvoice(
  receiptType: number,
  kind: Exclude<FiscalDocumentKind, "invoice">,
) {
  const receiptTypeMap = kind === "credit_note" ? CREDIT_NOTE_BY_INVOICE_RECEIPT_TYPE : DEBIT_NOTE_BY_INVOICE_RECEIPT_TYPE;
  const noteReceiptType = receiptTypeMap.get(receiptType);
  if (!noteReceiptType) {
    throw new ApiError(400, `Solo se puede emitir ${fiscalNoteLabel(kind)} sobre Factura A, B o C aprobada.`);
  }
  return noteReceiptType;
}

function formatFiscalReceipt(pointOfSale: number | null, receiptNumber: number | null) {
  if (!pointOfSale || !receiptNumber) return "";
  return `${String(pointOfSale).padStart(4, "0")}-${String(receiptNumber).padStart(8, "0")}`;
}

function digitsOnly(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

async function getSaleFiscalCandidate(companyId: number, saleId: string) {
  const result = await queryWithCompanyContext<{
    id: string;
    client_id: string | null;
    receipt_type: number | null;
    receipt_number: number | null;
    total_amount: string;
    vat_rate: string;
    fiscal_vat_rate: string | null;
    item_net_amount: string;
    client_name: string | null;
    client_document: string | null;
    fiscal_condition: string | null;
    order_status: string;
    desired_document: string | null;
    fiscal_status: FiscalAuthorizationStatus | null;
    cae: string | null;
    fiscal_point_of_sale: number | null;
    fiscal_receipt_type: number | null;
    fiscal_receipt_number: number | null;
    has_item_detail: boolean;
    fiscal_error_message: string | null;
  }>(
    companyId,
    `
      SELECT s.id::text AS id,
             s.client_id::text AS client_id,
             COALESCE(s.receipt_type, 0)::int AS receipt_type,
             COALESCE(s.receipt_number, 0)::int AS receipt_number,
             COALESCE(s.total_amount, 0)::text AS total_amount,
             COALESCE(s.vat_rate, 0)::text AS vat_rate,
             s.fiscal_vat_rate::text AS fiscal_vat_rate,
             COALESCE((
               SELECT SUM(COALESCE(si.total_amount, si.quantity * si.unit_price, 0))
               FROM sale_items si
               WHERE si.sale_id = s.id AND si.empresa_id = s.empresa_id
             ), 0)::text AS item_net_amount,
             COALESCE(s.client_name, c.display_name, '') AS client_name,
             COALESCE(s.client_document, c.tax_id, '') AS client_document,
             COALESCE(c.fiscal_condition, '') AS fiscal_condition,
             ${normalizedOrderStatusSql("s")} AS order_status,
             COALESCE(s.desired_document, '') AS desired_document,
             COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
             COALESCE(s.cae, '') AS cae,
             s.fiscal_point_of_sale,
             s.fiscal_receipt_type,
             s.fiscal_receipt_number,
             COALESCE(s.fiscal_error_message, '') AS fiscal_error_message,
             (
               EXISTS (
                 SELECT 1
                 FROM sale_items si
                 WHERE si.sale_id = s.id
                   AND si.empresa_id = s.empresa_id
                   AND COALESCE(si.quantity, 0) > 0
                   AND COALESCE(si.total_amount, 0) >= 0
                   AND (
                     si.product_id IS NOT NULL
                     OR NULLIF(BTRIM(COALESCE(si.description, '')), '') IS NOT NULL
                   )
               )
               AND NOT EXISTS (
                 SELECT 1
                 FROM sale_items si
                 WHERE si.sale_id = s.id
                   AND si.empresa_id = s.empresa_id
                   AND (
                     COALESCE(si.quantity, 0) <= 0
                     OR COALESCE(si.total_amount, 0) < 0
                     OR (
                       si.product_id IS NULL
                       AND NULLIF(BTRIM(COALESCE(si.description, '')), '') IS NULL
                     )
                   )
               )
             ) AS has_item_detail
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE s.id = $1::uuid AND s.empresa_id = $2
      LIMIT 1
    `,
    [saleId, companyId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Venta no encontrada");

  return {
    id: row.id,
    clientId: row.client_id,
    receiptType: Number(row.receipt_type ?? 0),
    receiptNumber: Number(row.receipt_number ?? 0),
    totalAmount: Number(row.total_amount),
    vatRate: Number(row.vat_rate),
    fiscalVatRate: row.fiscal_vat_rate === null ? null : Number(row.fiscal_vat_rate),
    itemNetAmount: Number(row.item_net_amount),
    customerName: row.client_name ?? "",
    customerDocument: row.client_document ?? "",
    customerFiscalCondition: row.fiscal_condition ?? "",
    orderStatus: row.order_status,
    desiredDocument: row.desired_document ?? "",
    fiscalStatus: row.fiscal_status ?? "no_enviado",
    cae: row.cae ?? "",
    fiscalPointOfSale: row.fiscal_point_of_sale,
    fiscalReceiptType: row.fiscal_receipt_type,
    fiscalReceiptNumber: row.fiscal_receipt_number,
    hasItemDetail: Boolean(row.has_item_detail),
    fiscalErrorMessage: row.fiscal_error_message ?? "",
  } satisfies SaleFiscalCandidate;
}

export async function getSaleFiscalNotePreview(
  companyId: number,
  saleId: string,
  kind: Exclude<FiscalDocumentKind, "invoice">,
  operationalDocumentId = "",
): Promise<SaleCreditNotePreview> {
  const className = fiscalNoteClass(kind);
  const result = await queryWithCompanyContext<{
    id: string;
    sale_number: string | null;
    total_amount: string;
    client_name: string | null;
    client_document: string | null;
    fiscal_status: FiscalAuthorizationStatus | null;
    cae: string | null;
    fiscal_point_of_sale: number | null;
    fiscal_receipt_type: number | null;
    fiscal_receipt_number: number | null;
    note_fiscal_status: FiscalAuthorizationStatus | null;
    note_cae: string | null;
    note_fiscal_point_of_sale: number | null;
    note_fiscal_receipt_number: number | null;
    note_fiscal_error_message: string | null;
    operational_document_id: string | null;
    operational_amount: string | null;
    operational_reason: string | null;
  }>(
    companyId,
    `
      SELECT s.id::text AS id,
             s.sale_number,
             COALESCE(s.total_amount, 0)::text AS total_amount,
             COALESCE(s.client_name, c.display_name, '') AS client_name,
             COALESCE(s.client_document, c.tax_id, '') AS client_document,
             COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
             COALESCE(s.cae, '') AS cae,
             s.fiscal_point_of_sale,
             s.fiscal_receipt_type,
             s.fiscal_receipt_number,
             COALESCE(nc.fiscal_status, '') AS note_fiscal_status,
             COALESCE(nc.cae, '') AS note_cae,
             nc.fiscal_point_of_sale AS note_fiscal_point_of_sale,
             nc.fiscal_receipt_number AS note_fiscal_receipt_number,
             COALESCE(nc.fiscal_error_message, '') AS note_fiscal_error_message
             , operational.id::text AS operational_document_id
             , operational.amount::text AS operational_amount
             , COALESCE(operational.reason, '') AS operational_reason
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      LEFT JOIN LATERAL (
        SELECT sid.fiscal_status, sid.cae, sid.fiscal_point_of_sale, sid.fiscal_receipt_number, sid.fiscal_error_message
        FROM sales_internal_documents sid
        WHERE sid.empresa_id = s.empresa_id
          AND sid.sale_id = s.id
          AND sid.class_name = $3
          AND sid.fiscal = true
          AND ($4::text = '' OR sid.operational_document_id = $4::uuid)
        ORDER BY
          CASE WHEN sid.fiscal_status = 'aprobado' AND COALESCE(sid.cae, '') <> '' THEN 0 ELSE 1 END,
          sid.created_at DESC
        LIMIT 1
      ) nc ON true
      LEFT JOIN sales_internal_documents operational
        ON operational.id = NULLIF($4, '')::uuid
       AND operational.empresa_id = s.empresa_id
       AND operational.sale_id = s.id
       AND operational.class_name = $3
       AND operational.fiscal = false
      WHERE s.id = $1::uuid AND s.empresa_id = $2
      LIMIT 1
    `,
    [saleId, companyId, className, operationalDocumentId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Venta no encontrada");
  if (!isFiscalApproved(row.fiscal_status ?? "no_enviado", row.cae ?? "")) {
    throw new ApiError(400, "La venta todavia no tiene factura aprobada con CAE.");
  }
  if (!row.fiscal_point_of_sale || !row.fiscal_receipt_type || !row.fiscal_receipt_number) {
    throw new ApiError(400, "La factura aprobada no tiene punto de venta, tipo o numero fiscal.");
  }
  if (operationalDocumentId && !row.operational_document_id) {
    throw new ApiError(404, "La nota operativa no existe o no pertenece a esta venta.");
  }

  const creditNoteReceiptType = fiscalNoteReceiptTypeForInvoice(row.fiscal_receipt_type, kind);
  return {
    saleId: row.id,
    saleNumber: row.sale_number ?? "",
    customerName: row.client_name ?? "",
    customerDocument: row.client_document ?? "",
    totalAmount: Number(row.total_amount),
    invoiceReceipt: formatFiscalReceipt(row.fiscal_point_of_sale, row.fiscal_receipt_number),
    invoiceReceiptType: row.fiscal_receipt_type,
    invoicePointOfSale: row.fiscal_point_of_sale,
    invoiceReceiptNumber: row.fiscal_receipt_number,
    invoiceCae: row.cae ?? "",
    creditNoteReceiptType,
    creditNoteStatus: row.note_fiscal_status ?? "",
    creditNoteReceipt: formatFiscalReceipt(row.note_fiscal_point_of_sale, row.note_fiscal_receipt_number),
    creditNoteCae: row.note_cae ?? "",
    creditNoteErrorMessage: row.note_fiscal_error_message ?? "",
    operationalDocumentId: row.operational_document_id ?? "",
    operationalAmount: row.operational_amount === null ? null : Number(row.operational_amount),
    operationalReason: row.operational_reason ?? "",
  };
}

export async function getSaleCreditNotePreview(companyId: number, saleId: string, operationalDocumentId = "") {
  return getSaleFiscalNotePreview(companyId, saleId, "credit_note", operationalDocumentId);
}

export async function getSaleDebitNotePreview(companyId: number, saleId: string, operationalDocumentId = "") {
  return getSaleFiscalNotePreview(companyId, saleId, "debit_note", operationalDocumentId);
}

async function markSaleFiscalPending(
  session: AuthSession,
  sale: SaleFiscalCandidate,
  receiptType: number,
  fiscal: FiscalStatus,
) {
  await withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `
        UPDATE sales
        SET fiscal_status = 'pendiente',
            fiscal_provider = $1,
            fiscal_mode = $2,
            fiscal_document_source = 'sale',
            fiscal_document_kind = 'invoice',
            fiscal_last_attempt_at = now(),
            fiscal_error_code = '',
            fiscal_error_message = '',
            fiscal_observations = '[]'::jsonb,
            receipt_type = CASE WHEN COALESCE(receipt_type, 0) = 0 THEN $3 ELSE receipt_type END,
            fiscal_point_of_sale = $4,
            fiscal_receipt_type = $3,
            tracking_status = CASE WHEN COALESCE(tracking_status, 'no_facturada') = 'facturada' THEN tracking_status ELSE 'no_facturada' END,
            updated_at = now()
        WHERE id = $5::uuid AND empresa_id = $6
      `,
      [fiscal.provider, fiscal.mode, receiptType, fiscal.pointOfSale ?? null, sale.id, session.companyId],
    );
    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "fiscal.autorizacion_solicitada",
        JSON.stringify({
          id: sale.id,
          source: "sale",
          kind: "invoice",
          receiptType,
          usuario: session.username,
        }),
        session.companyId,
      ],
    );
  });
}

async function markSaleFiscalFailure(
  session: AuthSession,
  saleId: string,
  status: Exclude<FiscalAuthorizationStatus, "no_enviado" | "pendiente" | "aprobado">,
  message: string,
) {
  await withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `
        UPDATE sales
        SET fiscal_status = $1,
            fiscal_error_message = $2,
            fiscal_last_attempt_at = now(),
            updated_at = now()
        WHERE id = $3::uuid AND empresa_id = $4
      `,
      [status, message, saleId, session.companyId],
    );
    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        status === "rechazado" ? "fiscal.autorizacion_rechazada" : "fiscal.autorizacion_error",
        JSON.stringify({ id: saleId, source: "sale", error: message, usuario: session.username }),
        session.companyId,
      ],
    );
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        status === "rechazado" ? "fiscal.invoice_rejected" : "fiscal.invoice_error",
        "sales",
        saleId,
        JSON.stringify({ status, message }),
        session.companyId,
      ],
    );
  });
  clearReadQueryCache();
}

export async function rejectSaleFiscalDocument(session: AuthSession, saleId: string, reason: string) {
  const sale = await getSaleFiscalCandidate(session.companyId, saleId);
  if (isFiscalApproved(sale.fiscalStatus, sale.cae)) {
    throw new ApiError(400, "La factura ya fue aprobada fiscalmente y no puede rechazarse desde la bandeja.");
  }

  const message = reason.trim() || "Rechazada desde Solicitudes y aprobaciones";
  await markSaleFiscalFailure(session, sale.id, "rechazado", message);
  return { id: sale.id, state: "rechazado" as const };
}

async function markSaleFiscalApproved(
  session: AuthSession,
  saleId: string,
  result: FiscalAuthorizationResult,
  vatRate: number,
) {
  await withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `
        UPDATE sales
        SET fiscal_status = 'aprobado',
            fiscal_point_of_sale = $1::integer,
            fiscal_receipt_type = $2::integer,
            fiscal_receipt_number = $3::integer,
            fiscal_vat_rate = $11::numeric,
            receipt_type = $2::integer,
            receipt_number = $9::bigint,
            cae = $4,
            cae_expires_at = $5::date,
            fiscal_issue_date = COALESCE(
              NULLIF($10::text, '')::date,
              (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
            ),
            fiscal_authorized_at = now(),
            fiscal_last_attempt_at = now(),
            fiscal_error_code = '',
            fiscal_error_message = '',
            fiscal_observations = $6::jsonb,
            tracking_status = 'facturada',
            updated_at = now()
        WHERE id = $7::uuid AND empresa_id = $8
      `,
      [
        result.pointOfSale,
        result.receiptType,
        result.receiptNumber,
        result.cae,
        result.caeExpiresAt,
        JSON.stringify(result.observations ?? []),
        saleId,
        session.companyId,
        result.receiptNumber,
        result.issueDate ?? "",
        fiscalVatRateSnapshot(result.receiptType, vatRate),
      ],
    );
    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "fiscal.autorizacion_aprobada",
        JSON.stringify({
          id: saleId,
          source: "sale",
          pointOfSale: result.pointOfSale,
          receiptType: result.receiptType,
          receiptNumber: result.receiptNumber,
          vatRate: fiscalVatRateSnapshot(result.receiptType, vatRate),
          issueDate: result.issueDate,
          cae: result.cae,
          caeExpiresAt: result.caeExpiresAt,
          observations: result.observations ?? [],
          usuario: session.username,
        }),
        session.companyId,
      ],
    );
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        "fiscal.invoice_approved",
        "sales",
        saleId,
        JSON.stringify({
          pointOfSale: result.pointOfSale,
          receiptType: result.receiptType,
          receiptNumber: result.receiptNumber,
          issueDate: result.issueDate,
          cae: result.cae,
          caeExpiresAt: result.caeExpiresAt,
        }),
        session.companyId,
      ],
    );
  });
  clearReadQueryCache();
}

async function prepareSaleFiscalNoteDocument(
  session: AuthSession,
  sale: SaleFiscalCandidate,
  kind: Exclude<FiscalDocumentKind, "invoice">,
  receiptType: number,
  noteAmount: number,
  fiscal: FiscalStatus,
  reason: string,
  requestedOperationalDocumentId = "",
) {
  const className = fiscalNoteClass(kind);
  return withCompanyContext(session.companyId, async (client) => {
    const operational = await client.query<{ id: string }>(
      `
        SELECT internal.id::text
        FROM sales_internal_documents internal
        WHERE internal.empresa_id = $1
          AND internal.sale_id = $2::uuid
          AND internal.class_name = $3
          AND internal.fiscal = false
          AND internal.amount = $4::numeric
          AND ($5::text = '' OR internal.id = $5::uuid)
          AND ($5::text <> '' OR NOT EXISTS (
            SELECT 1
            FROM sales_internal_documents fiscal_note
            WHERE fiscal_note.empresa_id = internal.empresa_id
              AND fiscal_note.operational_document_id = internal.id
          ))
        ORDER BY internal.issue_date DESC, internal.created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [session.companyId, sale.id, className, noteAmount, requestedOperationalDocumentId],
    );
    const operationalDocumentId = operational.rows[0]?.id ?? null;
    if (requestedOperationalDocumentId && !operationalDocumentId) {
      throw new ApiError(409, "La nota operativa no esta disponible para fiscalizar o ya tiene un comprobante fiscal asociado.");
    }
    const existing = await client.query<{
      id: string;
      fiscal_status: FiscalAuthorizationStatus;
      cae: string;
      fiscal_point_of_sale: number | null;
      fiscal_receipt_type: number | null;
      fiscal_receipt_number: number | null;
      cae_expires_at: string | null;
      fiscal_error_message: string | null;
    }>(
      `
        SELECT id::text, fiscal_status, COALESCE(cae, '') AS cae,
               fiscal_point_of_sale, fiscal_receipt_type, fiscal_receipt_number,
               cae_expires_at::text, fiscal_error_message
        FROM sales_internal_documents
        WHERE empresa_id = $1
          AND sale_id = $2::uuid
          AND class_name = $3
          AND fiscal = true
          AND amount = $4::numeric
          AND ($5::text = '' OR operational_document_id = $5::uuid)
        ORDER BY
          CASE WHEN fiscal_status = 'aprobado' AND COALESCE(cae, '') <> '' THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [session.companyId, sale.id, className, noteAmount, requestedOperationalDocumentId],
    );
    const current = existing.rows[0];
    if (current && isFiscalApproved(current.fiscal_status, current.cae)) {
      return {
        documentId: current.id,
        alreadyApproved: true,
        wasExisting: true,
        previousStatus: current.fiscal_status,
        previousErrorMessage: current.fiscal_error_message ?? "",
        result: {
          documentId: current.id,
          pointOfSale: current.fiscal_point_of_sale ?? 0,
          receiptType: current.fiscal_receipt_type ?? receiptType,
          receiptNumber: current.fiscal_receipt_number ?? 0,
          cae: current.cae,
          caeExpiresAt: current.cae_expires_at ?? "",
        } satisfies FiscalAuthorizationResult,
      };
    }

    if (current) {
      await client.query(
        `
          UPDATE sales_internal_documents
          SET fiscal_status = 'pendiente',
              fiscal_provider = $1,
              fiscal_mode = $2,
              fiscal_document_source = 'sales_document',
              fiscal_document_kind = $9,
              fiscal_last_attempt_at = now(),
              fiscal_error_code = '',
              fiscal_error_message = '',
              fiscal_observations = '[]'::jsonb,
              fiscal_point_of_sale = $3::integer,
              fiscal_receipt_type = $4::integer,
              receipt_type = $4::integer,
              amount = $5::numeric,
              reason = $6,
              operational_document_id = COALESCE(operational_document_id, $10::uuid)
          WHERE id = $7::uuid AND empresa_id = $8
        `,
        [
          fiscal.provider,
          fiscal.mode,
          fiscal.pointOfSale ?? null,
          receiptType,
          noteAmount,
          reason,
          current.id,
          session.companyId,
          kind,
          operationalDocumentId,
        ],
      );
      return {
        documentId: current.id,
        alreadyApproved: false,
        wasExisting: true,
        previousStatus: current.fiscal_status,
        previousErrorMessage: current.fiscal_error_message ?? "",
        result: null,
      };
    }

    const detailJson = [
      {
        name: `${fiscalNoteLabel(kind)} factura ${formatFiscalReceipt(sale.fiscalPointOfSale, sale.fiscalReceiptNumber)}`,
        quantity: 1,
        unitPrice: noteAmount,
        subtotal: noteAmount,
      },
    ];
    const insert = await client.query<{ id: string }>(
      `
        INSERT INTO sales_internal_documents (
          sale_id, delivery_id, class_name, fiscal, receipt_type, receipt_number,
          amount, detail_json, reason, stock_adjusted, created_by, created_by_name,
          fiscal_status, fiscal_provider, fiscal_mode, fiscal_document_source, fiscal_document_kind,
          fiscal_point_of_sale, fiscal_receipt_type, fiscal_last_attempt_at,
          operational_document_id, empresa_id
        )
        VALUES (
          $1::uuid, NULL, $12, true, $2::integer, NULL,
          $3::numeric, $4::jsonb, $5, false, $6::uuid, $7,
          'pendiente', $8, $9, 'sales_document', $13,
          $10::integer, $2::integer, now(), $14::uuid, $11
        )
        RETURNING id::text AS id
      `,
      [
        sale.id,
        receiptType,
        noteAmount,
        JSON.stringify(detailJson),
        reason,
        session.userId,
        session.username,
        fiscal.provider,
        fiscal.mode,
        fiscal.pointOfSale ?? null,
        session.companyId,
        className,
        kind,
        operationalDocumentId,
      ],
    );

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        `fiscal.${kind === "credit_note" ? "nota_credito" : "nota_debito"}_solicitada`,
        JSON.stringify({
          id: insert.rows[0].id,
          id_venta: sale.id,
          kind,
          receiptType,
          amount: noteAmount,
          usuario: session.username,
        }),
        session.companyId,
      ],
    );

    return {
      documentId: insert.rows[0].id,
      alreadyApproved: false,
      wasExisting: false,
      previousStatus: null,
      previousErrorMessage: "",
      result: null,
    };
  });
}

async function markSaleFiscalNoteFailure(
  session: AuthSession,
  documentId: string,
  kind: Exclude<FiscalDocumentKind, "invoice">,
  message: string,
) {
  await withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `
        UPDATE sales_internal_documents
        SET fiscal_status = 'error',
            fiscal_error_message = $1,
            fiscal_last_attempt_at = now()
        WHERE id = $2::uuid AND empresa_id = $3
      `,
      [message, documentId, session.companyId],
    );
    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        `fiscal.${kind === "credit_note" ? "nota_credito" : "nota_debito"}_error`,
        JSON.stringify({ id: documentId, kind, error: message, usuario: session.username }),
        session.companyId,
      ],
    );
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        kind === "credit_note" ? "fiscal.credit_note_error" : "fiscal.debit_note_error",
        "sales_internal_documents",
        documentId,
        JSON.stringify({ kind, message }),
        session.companyId,
      ],
    );
  });
  clearReadQueryCache();
}

async function markSaleFiscalNoteApproved(
  session: AuthSession,
  sale: SaleFiscalCandidate,
  kind: Exclude<FiscalDocumentKind, "invoice">,
  documentId: string,
  noteAmount: number,
  result: FiscalAuthorizationResult,
) {
  const isCreditNote = kind === "credit_note";
  await withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `
        UPDATE sales_internal_documents
        SET fiscal_status = 'aprobado',
            fiscal_point_of_sale = $1::integer,
            fiscal_receipt_type = $2::integer,
            fiscal_receipt_number = $3::integer,
            fiscal_vat_rate = $11::numeric,
            receipt_type = $2::integer,
            receipt_number = $9::bigint,
            cae = $4,
            cae_expires_at = $5::date,
            fiscal_issue_date = COALESCE(
              NULLIF($10::text, '')::date,
              (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
            ),
            fiscal_authorized_at = now(),
            fiscal_last_attempt_at = now(),
            fiscal_error_code = '',
            fiscal_error_message = '',
            fiscal_observations = $6::jsonb
        WHERE id = $7::uuid AND empresa_id = $8
      `,
      [
        result.pointOfSale,
        result.receiptType,
        result.receiptNumber,
        result.cae,
        result.caeExpiresAt,
        JSON.stringify(result.observations ?? []),
        documentId,
        session.companyId,
        result.receiptNumber,
        result.issueDate ?? "",
        fiscalVatRateSnapshot(result.receiptType, sale.fiscalVatRate ?? sale.vatRate),
      ],
    );

    const adjustmentState = await client.query<{
      account_adjusted: boolean;
      operational_account_adjusted: boolean;
    }>(
      `
        SELECT sid.account_adjusted,
               COALESCE(operational.account_adjusted, false) AS operational_account_adjusted
        FROM sales_internal_documents sid
        LEFT JOIN sales_internal_documents operational
          ON operational.id = sid.operational_document_id
         AND operational.empresa_id = sid.empresa_id
        WHERE sid.id = $1::uuid AND sid.empresa_id = $2
        LIMIT 1
      `,
      [documentId, session.companyId],
    );
    const financialAlreadyAdjusted = Boolean(
      adjustmentState.rows[0]?.account_adjusted || adjustmentState.rows[0]?.operational_account_adjusted,
    );
    if (!financialAlreadyAdjusted) {
      await client.query(
        `
        INSERT INTO current_account_movements (
          client_id, sale_id, entity_type, entity_name, description,
          debit, credit, movement_date, empresa_id
        )
        VALUES ($1::uuid, $2::uuid, 'cliente', $3, $4, $5::numeric, $6::numeric, $7::date, $8)
        `,
        [
          sale.clientId,
          sale.id,
          sale.customerName,
          `${isCreditNote ? "Nota de credito" : "Nota de debito"} fiscal ${formatFiscalReceipt(result.pointOfSale, result.receiptNumber)}`,
          isCreditNote ? 0 : noteAmount,
          isCreditNote ? noteAmount : 0,
          result.issueDate || localDateIso(),
          session.companyId,
        ],
      );
    }
    await client.query(
      "UPDATE sales_internal_documents SET account_adjusted = true WHERE id = $1::uuid AND empresa_id = $2",
      [documentId, session.companyId],
    );

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        `fiscal.${isCreditNote ? "nota_credito" : "nota_debito"}_aprobada`,
        JSON.stringify({
          id: documentId,
          id_venta: sale.id,
          kind,
          pointOfSale: result.pointOfSale,
          receiptType: result.receiptType,
          receiptNumber: result.receiptNumber,
          issueDate: result.issueDate,
          cae: result.cae,
          caeExpiresAt: result.caeExpiresAt,
          amount: noteAmount,
          observations: result.observations ?? [],
          usuario: session.username,
        }),
        session.companyId,
      ],
    );
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        isCreditNote ? "fiscal.credit_note_approved" : "fiscal.debit_note_approved",
        "sales_internal_documents",
        documentId,
        JSON.stringify({
          saleId: sale.id,
          kind,
          amount: noteAmount,
          pointOfSale: result.pointOfSale,
          receiptType: result.receiptType,
          receiptNumber: result.receiptNumber,
          issueDate: result.issueDate,
          cae: result.cae,
        }),
        session.companyId,
      ],
    );
  });
  clearReadQueryCache();
}

function isPostAuthorizationPersistenceError(message: string) {
  return /inconsistent types deduced|fiscal_receipt_number|receipt_number|issue_date|42P08|42703/i.test(message);
}

function fiscalReceiptMatchesSaleInvoice(receipt: ArcaAuthorizedReceipt, sale: SaleFiscalCandidate, receiptType: number) {
  return receipt.receiptType === receiptType
    && digitsOnly(receipt.customerDocument) === digitsOnly(sale.customerDocument)
    && Math.abs(receipt.totalAmount - sale.totalAmount) < 0.01;
}

async function recoverSaleFiscalInvoiceApproval(
  session: AuthSession,
  sale: SaleFiscalCandidate,
  receiptType: number,
) {
  let receipt: ArcaAuthorizedReceipt | null = null;
  try {
    receipt = await findLastArcaAuthorizedReceipt(receiptType);
  } catch (error) {
    throw new ApiError(
      409,
      `La factura pudo haber sido aprobada en ARCA, pero no pude consultarla para reconciliarla: ${fiscalErrorMessage(error)}`,
    );
  }
  if (!receipt || !fiscalReceiptMatchesSaleInvoice(receipt, sale, receiptType)) {
    throw new ApiError(
      409,
      "La factura pudo haber sido aprobada en ARCA, pero el ultimo comprobante no coincide con esta venta. No se reemitio para evitar un duplicado.",
    );
  }
  const result: FiscalAuthorizationResult = {
    documentId: sale.id,
    pointOfSale: receipt.pointOfSale,
    receiptType: receipt.receiptType,
    receiptNumber: receipt.receiptNumber,
    issueDate: receipt.issueDate,
    cae: receipt.cae,
    caeExpiresAt: receipt.caeExpiresAt,
    observations: receipt.observations,
  };
  await markSaleFiscalApproved(session, sale.id, result, sale.vatRate);
  return result;
}

function fiscalReceiptMatchesSaleNote(
  receipt: ArcaAuthorizedReceipt,
  sale: SaleFiscalCandidate,
  receiptType: number,
  noteAmount: number,
) {
  const sameReceiptType = receipt.receiptType === receiptType;
  const sameCustomer = digitsOnly(receipt.customerDocument) === digitsOnly(sale.customerDocument);
  const sameAmount = Math.abs(receipt.totalAmount - noteAmount) < 0.01;
  const sameAssociatedInvoice = receipt.associatedReceipts.some(
    (associated) =>
      associated.pointOfSale === sale.fiscalPointOfSale &&
      associated.receiptType === sale.fiscalReceiptType &&
      associated.receiptNumber === sale.fiscalReceiptNumber,
  );

  return sameReceiptType && sameCustomer && sameAmount && sameAssociatedInvoice;
}

async function recoverSaleFiscalNoteApproval(
  session: AuthSession,
  sale: SaleFiscalCandidate,
  kind: Exclude<FiscalDocumentKind, "invoice">,
  documentId: string,
  receiptType: number,
  noteAmount: number,
  requireRecovery: boolean,
) {
  let receipt: ArcaAuthorizedReceipt | null = null;
  try {
    receipt = await findLastArcaAuthorizedReceipt(receiptType);
  } catch (error) {
    if (!requireRecovery) return null;
    throw new ApiError(
      409,
      `La ${fiscalNoteLabel(kind)} anterior pudo haber sido aprobada en ARCA, pero no pude consultar ARCA para reconciliarla: ${fiscalErrorMessage(error)}`,
    );
  }

  if (!receipt || !fiscalReceiptMatchesSaleNote(receipt, sale, receiptType, noteAmount)) {
    if (!requireRecovery) return null;
    throw new ApiError(
      409,
      `La ${fiscalNoteLabel(kind)} anterior pudo haber sido aprobada en ARCA, pero el ultimo comprobante no coincide con la factura asociada. No reemito para evitar duplicados.`,
    );
  }

  const result: FiscalAuthorizationResult = {
    documentId,
    pointOfSale: receipt.pointOfSale,
    receiptType: receipt.receiptType,
    receiptNumber: receipt.receiptNumber,
    issueDate: receipt.issueDate,
    cae: receipt.cae,
    caeExpiresAt: receipt.caeExpiresAt,
    observations: receipt.observations,
  };
  await markSaleFiscalNoteApproved(session, sale, kind, documentId, noteAmount, result);
  return result;
}

function normalizeFiscalNoteAmount(value: number | undefined, fallback: number, kind: Exclude<FiscalDocumentKind, "invoice">) {
  const amount = value === undefined || !Number.isFinite(value) || value <= 0 ? fallback : Number(value.toFixed(2));
  if (amount <= 0) throw new ApiError(400, `El monto de la ${fiscalNoteLabel(kind)} debe ser mayor a cero.`);
  if (kind === "credit_note" && amount > fallback) {
    throw new ApiError(400, "La nota de credito no puede superar el total de la factura.");
  }
  return amount;
}

export async function authorizeSaleFiscalNote(
  session: AuthSession,
  saleId: string,
  kind: Exclude<FiscalDocumentKind, "invoice">,
  reason = "",
  requestedAmount?: number,
  operationalDocumentId = "",
) {
  const sale = await getSaleFiscalCandidate(session.companyId, saleId);
  if (!isFiscalApproved(sale.fiscalStatus, sale.cae)) {
    throw new ApiError(400, "La venta todavia no tiene factura aprobada con CAE.");
  }
  if (!sale.fiscalPointOfSale || !sale.fiscalReceiptType || !sale.fiscalReceiptNumber) {
    throw new ApiError(400, "La factura aprobada no tiene punto de venta, tipo o numero fiscal.");
  }
  if (!sale.customerDocument.trim()) {
    throw new ApiError(400, "La venta no tiene CUIT/DNI del cliente.");
  }
  if (!Number.isFinite(sale.totalAmount) || sale.totalAmount <= 0) {
    throw new ApiError(400, "La venta no tiene monto fiscal valido.");
  }
  if (sale.fiscalVatRate === null) {
    throw new ApiError(
      409,
      "La factura asociada es historica y no registra la alicuota efectivamente autorizada. La nota fiscal requiere revision contable manual.",
    );
  }

  let operationalAmount: number | null = null;
  let operationalReason = "";
  if (operationalDocumentId) {
    const operational = await queryWithCompanyContext<{ amount: string; reason: string }>(
      session.companyId,
      `
        SELECT amount::text, COALESCE(reason, '') AS reason
        FROM sales_internal_documents
        WHERE id = $1::uuid AND empresa_id = $2 AND sale_id = $3::uuid
          AND class_name = $4 AND fiscal = false
        LIMIT 1
      `,
      [operationalDocumentId, session.companyId, sale.id, fiscalNoteClass(kind)],
    );
    if (!operational.rows[0]) throw new ApiError(404, "La nota operativa no existe o no pertenece a esta venta.");
    operationalAmount = Number(operational.rows[0].amount);
    operationalReason = operational.rows[0].reason;
  }

  const receiptType = fiscalNoteReceiptTypeForInvoice(sale.fiscalReceiptType, kind);
  assertFiscalVatRate(receiptType, sale.fiscalVatRate);
  const noteAmount = normalizeFiscalNoteAmount(operationalAmount ?? requestedAmount, sale.totalAmount, kind);
  const fiscal = getFiscalStatus();
  const document = await prepareSaleFiscalNoteDocument(
    session,
    sale,
    kind,
    receiptType,
    noteAmount,
    fiscal,
    operationalReason || reason.trim() || `${fiscalNoteLabel(kind)} factura ${formatFiscalReceipt(sale.fiscalPointOfSale, sale.fiscalReceiptNumber)}`,
    operationalDocumentId,
  );
  if (document.alreadyApproved && document.result) return document.result;

  const requireRecovery = document.wasExisting && isPostAuthorizationPersistenceError(document.previousErrorMessage ?? "");
  if (fiscal.provider === "arca" && document.wasExisting) {
    const recovered = await recoverSaleFiscalNoteApproval(
      session,
      sale,
      kind,
      document.documentId,
      receiptType,
      noteAmount,
      requireRecovery,
    );
    if (recovered) return recovered;
  }

  try {
    const result = await getFiscalProvider().authorizeDocument({
      companyId: session.companyId,
      userId: session.userId,
      username: session.username,
      documentId: document.documentId,
      source: "sales_document",
      kind,
      receiptType,
      receiptNumber: 0,
      totalAmount: noteAmount,
      vatRate: sale.fiscalVatRate,
      customerName: sale.customerName,
      customerDocument: sale.customerDocument,
      customerFiscalCondition: sale.customerFiscalCondition,
      preserveReceiptType: true,
      associatedReceipt: {
        pointOfSale: sale.fiscalPointOfSale,
        receiptType: sale.fiscalReceiptType,
        receiptNumber: sale.fiscalReceiptNumber,
      },
    });
    await markSaleFiscalNoteApproved(session, sale, kind, document.documentId, noteAmount, result);
    return result;
  } catch (error) {
    const message = fiscalErrorMessage(error);
    await markSaleFiscalNoteFailure(session, document.documentId, kind, message);
    throw error;
  }
}

export async function authorizeSaleCreditNote(session: AuthSession, saleId: string, reason = "", amount?: number, operationalDocumentId = "") {
  return authorizeSaleFiscalNote(session, saleId, "credit_note", reason, amount, operationalDocumentId);
}

export async function authorizeSaleDebitNote(session: AuthSession, saleId: string, reason = "", amount?: number, operationalDocumentId = "") {
  return authorizeSaleFiscalNote(session, saleId, "debit_note", reason, amount, operationalDocumentId);
}

export async function authorizeSaleFiscalDocument(session: AuthSession, saleId: string) {
  const sale = await getSaleFiscalCandidate(session.companyId, saleId);
  if (isFiscalApproved(sale.fiscalStatus, sale.cae)) {
    return {
      documentId: sale.id,
      pointOfSale: sale.fiscalPointOfSale ?? 0,
      receiptType: sale.fiscalReceiptType ?? sale.receiptType,
      receiptNumber: sale.fiscalReceiptNumber ?? sale.receiptNumber,
      cae: sale.cae,
      caeExpiresAt: "",
    };
  }
  if (sale.orderStatus !== "entregado") {
    throw new ApiError(400, "Solo se puede emitir factura fiscal de una venta entregada.");
  }
  if (!sale.customerDocument.trim()) {
    throw new ApiError(400, "La venta no tiene CUIT/DNI del cliente.");
  }
  if (!Number.isFinite(sale.totalAmount) || sale.totalAmount <= 0) {
    throw new ApiError(400, "La venta no tiene monto fiscal valido.");
  }
  if (!sale.hasItemDetail) {
    throw new ApiError(
      409,
      "La venta no tiene un detalle de productos valido. Revise los renglones antes de emitir el comprobante fiscal.",
    );
  }

  const receiptType = receiptTypeForArcaVatCondition(
    sale.customerFiscalCondition,
    invoiceReceiptTypeFromSale(sale),
  );
  assertFiscalVatRate(receiptType, sale.vatRate);
  assertSaleFinalTotal(sale);
  const fiscal = getFiscalStatus();
  if (
    fiscal.provider === "arca"
    && sale.fiscalStatus === "error"
    && isPostAuthorizationPersistenceError(sale.fiscalErrorMessage)
  ) {
    return recoverSaleFiscalInvoiceApproval(session, sale, receiptType);
  }
  await markSaleFiscalPending(session, sale, receiptType, fiscal);

  try {
    const result = await getFiscalProvider().authorizeDocument({
      companyId: session.companyId,
      userId: session.userId,
      username: session.username,
      documentId: sale.id,
      source: "sale",
      kind: "invoice",
      receiptType,
      receiptNumber: sale.receiptNumber,
      totalAmount: sale.totalAmount,
      vatRate: sale.vatRate,
      customerName: sale.customerName,
      customerDocument: sale.customerDocument,
      customerFiscalCondition: sale.customerFiscalCondition,
    });
    await markSaleFiscalApproved(session, sale.id, result, sale.vatRate);
    return result;
  } catch (error) {
    const message = fiscalErrorMessage(error);
    await markSaleFiscalFailure(session, sale.id, fiscalFailureStatus(error), message);
    throw error;
  }
}

export async function authorizeFiscalDocument(
  session: AuthSession,
  documentId: string,
  source: FiscalDocumentSource,
  kind: FiscalDocumentKind,
) {
  if (source === "sale" && kind === "invoice") {
    return authorizeSaleFiscalDocument(session, documentId);
  }
  if (source === "sale" && kind === "credit_note") {
    return authorizeSaleCreditNote(session, documentId);
  }
  if (source === "sale" && kind === "debit_note") {
    return authorizeSaleDebitNote(session, documentId);
  }
  throw new ApiError(400, "La autorizacion fiscal soporta facturas y notas de credito/debito de ventas entregadas.");
}
