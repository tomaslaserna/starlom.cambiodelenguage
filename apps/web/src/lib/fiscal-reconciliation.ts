import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { normalizeRole } from "@/lib/auth";
import { authorizeArcaInvoice, consultArcaAuthorizedReceipt, findLastArcaAuthorizedReceipt } from "@/lib/arca/wsfe";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";

const INCIDENT_CODE = "arca-2026-08-24-persistence";
const POINT_OF_SALE = 2;
const INVOICE_TYPE = 1;
const CREDIT_NOTE_TYPE = 3;

type IncidentInvoice = {
  saleId: string;
  invoiceNumber: number;
  amount: number;
  customerDocument: string;
  expectedCae?: string;
};

const VALID_INVOICES: IncidentInvoice[] = [
  { saleId: "fa2e7562-bef5-4003-8614-7bf17eb027a5", invoiceNumber: 20, amount: 346391.64, customerDocument: "30719377935", expectedCae: "86349700257801" },
  { saleId: "af44a972-9e5a-473d-8cf3-253e8ed7715e", invoiceNumber: 21, amount: 135814.68, customerDocument: "30718736575", expectedCae: "86349700277585" },
  { saleId: "42c54059-569c-473a-8f81-e5a95611ce87", invoiceNumber: 29, amount: 271810.08, customerDocument: "30719377935" },
];

const DUPLICATE_INVOICES: IncidentInvoice[] = [
  { saleId: VALID_INVOICES[0].saleId, invoiceNumber: 22, amount: 346391.64, customerDocument: "30719377935", expectedCae: "86349700376141" },
  { saleId: VALID_INVOICES[0].saleId, invoiceNumber: 23, amount: 346391.64, customerDocument: "30719377935", expectedCae: "86349700423894" },
  { saleId: VALID_INVOICES[1].saleId, invoiceNumber: 24, amount: 135814.68, customerDocument: "30718736575", expectedCae: "86349700468508" },
  { saleId: VALID_INVOICES[1].saleId, invoiceNumber: 25, amount: 135814.68, customerDocument: "30718736575", expectedCae: "86349700494480" },
  { saleId: VALID_INVOICES[1].saleId, invoiceNumber: 26, amount: 135814.68, customerDocument: "30718736575", expectedCae: "86349700646766" },
  { saleId: VALID_INVOICES[0].saleId, invoiceNumber: 27, amount: 346391.64, customerDocument: "30719377935", expectedCae: "86349700704523" },
  { saleId: VALID_INVOICES[1].saleId, invoiceNumber: 28, amount: 135814.68, customerDocument: "30718736575", expectedCae: "86349701091016" },
];

function assertAdministrator(session: AuthSession) {
  if (normalizeRole(session.role) !== "administrador") throw new ApiError(403, "Solo Administrador puede ejecutar esta conciliacion.");
}

function moneyMatches(left: number, right: number) {
  return Math.abs(left - right) < 0.01;
}

function validateInvoice(receipt: Awaited<ReturnType<typeof consultArcaAuthorizedReceipt>>, expected: IncidentInvoice) {
  if (!receipt) throw new ApiError(404, `ARCA no devolvio la factura ${expected.invoiceNumber}.`);
  if (receipt.pointOfSale !== POINT_OF_SALE || receipt.receiptType !== INVOICE_TYPE || receipt.receiptNumber !== expected.invoiceNumber) {
    throw new ApiError(409, `La identidad fiscal de la factura ${expected.invoiceNumber} no coincide.`);
  }
  if (receipt.customerDocument.replace(/\D/g, "") !== expected.customerDocument || !moneyMatches(receipt.totalAmount, expected.amount)) {
    throw new ApiError(409, `CUIT o monto inesperado en la factura ${expected.invoiceNumber}.`);
  }
  if (expected.expectedCae && receipt.cae !== expected.expectedCae) throw new ApiError(409, `CAE inesperado en la factura ${expected.invoiceNumber}.`);
  return receipt;
}

async function findCancellation(invoiceNumber: number) {
  const last = await findLastArcaAuthorizedReceipt(CREDIT_NOTE_TYPE);
  if (!last) return null;
  const first = Math.max(1, last.receiptNumber - 60);
  for (let number = last.receiptNumber; number >= first; number -= 1) {
    const receipt = number === last.receiptNumber ? last : await consultArcaAuthorizedReceipt(CREDIT_NOTE_TYPE, number);
    if (receipt?.associatedReceipts.some((item) => item.pointOfSale === POINT_OF_SALE && item.receiptType === INVOICE_TYPE && item.receiptNumber === invoiceNumber)) return receipt;
  }
  return null;
}

export async function inspectFiscalIncident(session: AuthSession) {
  assertAdministrator(session);
  const valid = [];
  for (const item of VALID_INVOICES) {
    const receipt = validateInvoice(await consultArcaAuthorizedReceipt(INVOICE_TYPE, item.invoiceNumber), item);
    valid.push({ ...item, receipt, linked: false });
  }
  const linkedRows = await queryWithCompanyContext<{ id: string; fiscal_receipt_number: number | null; cae: string }>(session.companyId,
    `SELECT id::text, fiscal_receipt_number, COALESCE(cae, '') AS cae FROM sales WHERE empresa_id=$1 AND id = ANY($2::uuid[])`,
    [session.companyId, VALID_INVOICES.map((item) => item.saleId)]);
  const linked = new Map(linkedRows.rows.map((row) => [row.id, row]));
  for (const item of valid) item.linked = linked.get(item.saleId)?.fiscal_receipt_number === item.invoiceNumber && linked.get(item.saleId)?.cae === item.receipt.cae;

  const duplicates = [];
  for (const item of DUPLICATE_INVOICES) {
    validateInvoice(await consultArcaAuthorizedReceipt(INVOICE_TYPE, item.invoiceNumber), item);
    duplicates.push({ ...item, cancellation: await findCancellation(item.invoiceNumber) });
  }
  return { incidentCode: INCIDENT_CODE, valid, duplicates };
}

export async function linkIncidentInvoice(session: AuthSession, invoiceNumber: number) {
  assertAdministrator(session);
  const expected = VALID_INVOICES.find((item) => item.invoiceNumber === invoiceNumber);
  if (!expected) throw new ApiError(400, "Factura fuera de la conciliacion autorizada.");
  const receipt = validateInvoice(await consultArcaAuthorizedReceipt(INVOICE_TYPE, invoiceNumber), expected);
  await withCompanyContext(session.companyId, async (client) => {
    const sale = await client.query<{ total_amount: string; client_document: string; vat_rate: string }>(
      `SELECT total_amount::text, COALESCE(client_document,'') AS client_document, COALESCE(vat_rate,0)::text AS vat_rate FROM sales WHERE id=$1::uuid AND empresa_id=$2 FOR UPDATE`,
      [expected.saleId, session.companyId],
    );
    const row = sale.rows[0];
    if (!row || !moneyMatches(Number(row.total_amount), expected.amount) || row.client_document.replace(/\D/g, "") !== expected.customerDocument) throw new ApiError(409, "La venta local no coincide con el comprobante ARCA.");
    await client.query(`UPDATE sales SET fiscal_status='aprobado', fiscal_provider='arca', fiscal_mode='production', fiscal_document_source='sale', fiscal_document_kind='invoice', fiscal_point_of_sale=$1, fiscal_receipt_type=$2, fiscal_receipt_number=$3, fiscal_vat_rate=$4::numeric, receipt_type=$2, receipt_number=$3, cae=$5, cae_expires_at=$6::date, fiscal_issue_date=$7::date, fiscal_authorized_at=COALESCE(fiscal_authorized_at,now()), fiscal_last_attempt_at=now(), fiscal_error_code='', fiscal_error_message='', fiscal_observations=$8::jsonb, tracking_status='facturada', updated_at=now() WHERE id=$9::uuid AND empresa_id=$10`,
      [receipt.pointOfSale, receipt.receiptType, receipt.receiptNumber, Number(row.vat_rate), receipt.cae, receipt.caeExpiresAt, receipt.issueDate, JSON.stringify(receipt.observations), expected.saleId, session.companyId]);
    await client.query(`UPDATE app_solicitudes SET estado='aprobada', resuelto_por=$1, resuelto_at=now(), updated_at=now() WHERE empresa_id=$2 AND tipo='factura_fiscal' AND metadata->>'saleId'=$3 AND estado='pendiente'`, [session.username, session.companyId, expected.saleId]);
    await client.query(`INSERT INTO eventos_integracion(tipo,datos,empresa_id) VALUES('fiscal.conciliacion_factura_recuperada',$1::jsonb,$2)`, [JSON.stringify({incidentCode:INCIDENT_CODE,saleId:expected.saleId,receiptNumber:invoiceNumber,cae:receipt.cae,user:session.username}),session.companyId]);
    await client.query(`INSERT INTO audit_log(actor_id,action,entity_table,entity_id,new_data,empresa_id) VALUES($1,'fiscal.invoice_reconciled','sales',$2::uuid,$3::jsonb,$4)`, [session.userId,expected.saleId,JSON.stringify({incidentCode:INCIDENT_CODE,receipt}),session.companyId]);
  });
  clearReadQueryCache();
  return receipt;
}

export async function cancelIncidentDuplicate(session: AuthSession, invoiceNumber: number) {
  assertAdministrator(session);
  const expected = DUPLICATE_INVOICES.find((item) => item.invoiceNumber === invoiceNumber);
  if (!expected) throw new ApiError(400, "Factura fuera de la conciliacion autorizada.");
  validateInvoice(await consultArcaAuthorizedReceipt(INVOICE_TYPE, invoiceNumber), expected);
  let cancellation = await findCancellation(invoiceNumber);
  if (!cancellation) {
    const sale = await queryWithCompanyContext<{ fiscal_condition: string; vat_rate: string }>(session.companyId,
      `SELECT COALESCE(c.fiscal_condition,'') AS fiscal_condition, COALESCE(s.vat_rate,0)::text AS vat_rate FROM sales s LEFT JOIN clients c ON c.id=s.client_id AND c.empresa_id=s.empresa_id WHERE s.id=$1::uuid AND s.empresa_id=$2`,
      [expected.saleId, session.companyId]);
    if (!sale.rows[0]) throw new ApiError(404, "Venta base no encontrada.");
    const issued = await authorizeArcaInvoice({customerDocument:expected.customerDocument,customerVatCondition:sale.rows[0].fiscal_condition,receiptType:CREDIT_NOTE_TYPE,totalAmount:expected.amount,vatRate:Number(sale.rows[0].vat_rate),preserveReceiptType:true,associatedReceipt:{pointOfSale:POINT_OF_SALE,receiptType:INVOICE_TYPE,receiptNumber:invoiceNumber}});
    cancellation = await consultArcaAuthorizedReceipt(CREDIT_NOTE_TYPE, issued.receiptNumber);
  }
  if (!cancellation || !moneyMatches(cancellation.totalAmount, expected.amount) || !cancellation.associatedReceipts.some((item) => item.pointOfSale===POINT_OF_SALE && item.receiptType===INVOICE_TYPE && item.receiptNumber===invoiceNumber)) throw new ApiError(502, "ARCA no confirmo correctamente la nota de credito asociada.");
  await withCompanyContext(session.companyId, async (client) => {
    const exists = await client.query(`SELECT 1 FROM eventos_integracion WHERE empresa_id=$1 AND tipo='fiscal.conciliacion_duplicado_anulado' AND datos->>'invoiceNumber'=$2 LIMIT 1`, [session.companyId,String(invoiceNumber)]);
    if (!exists.rowCount) {
      const data={incidentCode:INCIDENT_CODE,saleId:expected.saleId,invoiceNumber,invoiceCae:expected.expectedCae,amount:expected.amount,creditNote:cancellation,user:session.username,accountingImpact:false,stockImpact:false};
      await client.query(`INSERT INTO eventos_integracion(tipo,datos,empresa_id) VALUES('fiscal.conciliacion_duplicado_anulado',$1::jsonb,$2)`,[JSON.stringify(data),session.companyId]);
      await client.query(`INSERT INTO audit_log(actor_id,action,entity_table,entity_id,new_data,empresa_id) VALUES($1,'fiscal.duplicate_invoice_cancelled','sales',$2::uuid,$3::jsonb,$4)`,[session.userId,expected.saleId,JSON.stringify(data),session.companyId]);
    }
  });
  return cancellation;
}
