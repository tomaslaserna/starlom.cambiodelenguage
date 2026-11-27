import { ApiError } from "@/lib/api-response";
import { getFiscalReissue } from "@/lib/fiscal-reissue";
import { buildArcaQrImage } from "@/lib/pdf/documents";
import {
  createPdfFile,
  pdfDate,
  pdfMoney,
  pdfNumber,
} from "@/lib/pdf/renderer";
import {
  allocateAmountByWeights,
  vatAmountsFromGross,
} from "@/lib/vat-calculation";
export async function buildFiscalReissuePdf(
  companyId: number,
  saleId: string,
  stage: "original" | "credit" | "invoice",
) {
  const record = await getFiscalReissue(companyId, saleId);
  if (!record) throw new ApiError(404, "Expediente no encontrado.");
  const s = record.snapshot;
  const auth =
    stage === "original"
      ? s.original
      : stage === "credit"
        ? record.credit
        : record.invoice;
  if (!auth)
    throw new ApiError(409, "Este comprobante todavía no está autorizado.");
  const party = stage === "invoice" ? s.target : s.source;
  const number = `${String(auth.pointOfSale).padStart(4, "0")}-${String(auth.receiptNumber).padStart(8, "0")}`;
  const originalNumber = `${String(s.original.pointOfSale).padStart(4, "0")}-${String(s.original.receiptNumber).padStart(8, "0")}`;
  const total = stage === "invoice" ? (s.replacementTotal ?? s.total) : s.total;
  const items = stage === "invoice" ? (s.invoiceItems ?? s.items) : s.items;
  const amounts = vatAmountsFromGross(total, 21);
  const nets = allocateAmountByWeights(
    amounts.net,
    items.map((i) => i.amount),
  );
  const totals = allocateAmountByWeights(
    total,
    items.map((i) => i.amount),
  );
  const qr = await buildArcaQrImage({
    issueDate: auth.issueDate,
    pointOfSale: auth.pointOfSale,
    receiptType: auth.receiptType,
    receiptNumber: auth.receiptNumber,
    total,
    customerDocument: party.document,
    cae: auth.cae,
  });
  return createPdfFile(
    `${stage === "credit" ? "NCA" : "FA"}_${number}.pdf`,
    ({ pdf }) => {
      pdf.drawHeader({
        title: stage === "credit" ? "NOTA DE CREDITO" : "FACTURA",
        code: "A",
        fiscalCode: stage === "credit" ? "003" : "001",
        number,
        date: pdfDate(auth.issueDate),
        variant: "fiscal",
        footerLeft: "Comprobante autorizado - ARCA",
        footerRight: `Total ${pdfMoney(total)}`,
        continuationSubject: party.name,
      });
      pdf.fiscalClientBox({
        name: party.name,
        document: party.document,
        ivaCondition: party.condition,
        address: party.address,
        saleCondition: s.paymentCondition,
        associatedDocument:
          stage === "original" ? undefined : `Factura A ${originalNumber}`,
      });
      pdf.fiscalItemsTable(
        items.map((i, n) => ({
          code: i.code,
          description: i.name,
          quantity: pdfNumber(i.quantity),
          unit: "unidades",
          unitPrice: pdfMoney((nets[n] ?? 0) / i.quantity),
          discount: "0,00",
          vatRate: "21%",
          subtotal: pdfMoney(totals[n] ?? 0),
        })),
      );
      if (stage === "credit") pdf.note(record.reason);
      if (stage === "invoice")
        pdf.note(
          `Refacturación: ${record.reason}. Sustituye factura A ${originalNumber}.`,
        );
      if (stage === "original")
        pdf.note(
          record.credit
            ? "Comprobante original reemplazado mediante refacturación fiscal."
            : "Comprobante original con expediente de refacturación en curso.",
        );
      if (stage === "invoice" && s.operationalReturns?.length)
        pdf.note(
        "Importe neto de las devoluciones de mercadería ya registradas.",
        );
      pdf.fiscalSummary(
        [
          ["Importe Neto Gravado", pdfMoney(amounts.net)],
          ["IVA 21%", pdfMoney(amounts.vat)],
          ["Importe Otros Tributos", pdfMoney(0)],
        ],
        "Importe Total",
        pdfMoney(total),
        { keepWithNext: 66 },
      );
      pdf.fiscalAuthorizationBox(auth.cae, pdfDate(auth.caeExpiresAt), qr);
    },
  );
}
