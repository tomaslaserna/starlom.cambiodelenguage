import { ApiError } from "@/lib/api-response";
import type { ArcaInvoiceAuthorization } from "@/lib/arca/wsfe";
export type FiscalParty = {
  name: string;
  document: string;
  condition: string;
  address: string;
};
export type ReissueSnapshot = {
  saleId: string;
  clientId: string;
  total: number;
  vatRate: number;
  source: FiscalParty;
  target: FiscalParty;
  original: ArcaInvoiceAuthorization;
  items: {
    id?: string;
    code: string;
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  paymentCondition: string;
  replacementTotal?: number;
  invoiceItems?: ReissueSnapshot["items"];
  operationalReturns?: import("@/lib/fiscal-reissue-returns").OperationalReturn[];
};
export type ReissueState =
  | "prepared"
  | "credit_pending"
  | "credit_approved"
  | "invoice_pending"
  | "completed"
  | "review_required";
export type ReissueRecord = {
  snapshot: ReissueSnapshot;
  reason: string;
  creditId: string;
  invoiceId: string;
  state: ReissueState;
  credit: ArcaInvoiceAuthorization | null;
  invoice: ArcaInvoiceAuthorization | null;
  error: string;
};
function validCuit(value: string) {
  if (!/^\d{11}$/.test(value)) return false;
  const sum = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce(
    (n, w, i) => n + w * Number(value[i]),
    0,
  );
  const check = 11 - (sum % 11);
  return Number(value[10]) === (check === 11 ? 0 : check === 10 ? 9 : check);
}
export function validateReissueSnapshot(s: ReissueSnapshot) {
  if (
    !s.clientId ||
    !validCuit(s.source.document) ||
    !validCuit(s.target.document) ||
    s.source.document === s.target.document
  )
    throw new ApiError(
      409,
      "La refacturación requiere CUIT válidos y distintos para el mismo cliente comercial.",
    );
  if (
    !s.source.name.trim() ||
    !s.target.name.trim() ||
    !s.source.condition ||
    !s.target.condition
  )
    throw new ApiError(409, "Faltan los datos fiscales de los destinatarios.");
  if (
    s.original.receiptType !== 1 ||
    s.vatRate !== 21 ||
    !s.original.pointOfSale ||
    !s.original.receiptNumber ||
    !/^\d{14}$/.test(s.original.cae)
  )
    throw new ApiError(
      409,
      "Este circuito admite facturas A aprobadas con IVA 21% registrado.",
    );
  if (
    !Number.isFinite(s.total) ||
    s.total <= 0 ||
    !s.items.length ||
    s.items.some(
      (i) =>
        !i.name.trim() ||
        !Number.isFinite(i.quantity) ||
        i.quantity <= 0 ||
        !Number.isFinite(i.amount) ||
        i.amount < 0 ||
        !Number.isFinite(i.unitPrice) ||
        i.unitPrice < 0,
    )
  )
    throw new ApiError(409, "Importe o detalle fiscal inválido.");
}
function validApproval(
  a: ArcaInvoiceAuthorization,
  kind: "credit" | "invoice",
  original: ReissueSnapshot["original"],
) {
  if (
    !/^\d{14}$/.test(a.cae) ||
    !a.caeExpiresAt ||
    !/^\d{4}-\d{2}-\d{2}$/.test(a.issueDate) ||
    a.receiptNumber <= 0 ||
    a.receiptType !== (kind === "credit" ? 3 : 1) ||
    a.pointOfSale !== original.pointOfSale
  )
    throw new ApiError(
      409,
      "La autorización recibida requiere conciliación fiscal.",
    );
}
export async function runReissue(
  record: ReissueRecord,
  save: (change: Partial<ReissueRecord>) => Promise<ReissueRecord>,
  issue: (
    kind: "credit" | "invoice",
    record: ReissueRecord,
  ) => Promise<ArcaInvoiceAuthorization>,
) {
  if (record.state === "completed") return record;
  validateReissueSnapshot(record.snapshot);
  if (!record.reason.trim())
    throw new ApiError(400, "El motivo es obligatorio.");
  let current = record;
  try {
    if (!current.credit) {
      current = await save({ state: "credit_pending", error: "" });
      const credit = await issue("credit", current);
      validApproval(credit, "credit", current.snapshot.original);
      current = await save({ credit, state: "credit_approved", error: "" });
    }
    if (!current.invoice) {
      current = await save({ state: "invoice_pending", error: "" });
      const invoice = await issue("invoice", current);
      validApproval(invoice, "invoice", current.snapshot.original);
      current = await save({ invoice, state: "completed", error: "" });
    }
    return current;
  } catch (error) {
    await save({
      state: "review_required",
      error: (error instanceof Error ? error.message : "Error fiscal").slice(
        0,
        1800,
      ),
    }).catch(() => undefined);
    throw error;
  }
}
