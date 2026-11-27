import { ApiError } from "@/lib/api-response";
import { vatAmountsFromGross } from "@/lib/vat-calculation";
import type { ArcaAuthorizedReceipt } from "@/lib/arca/wsfe";
import type { ReissueSnapshot } from "@/lib/fiscal-reissue-domain";
const conditions: Record<number, string> = {
  1: "Responsable Inscripto",
  6: "Monotributista",
  13: "Monotributista Social",
  16: "Trabajador Independiente Promovido",
};
export function requireCompatibleTargetCondition(value: string) {
  const v = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const accepted: Record<string, number> = {
    responsableinscripto: 1,
    ivaresponsableinscripto: 1,
    ri: 1,
    monotributista: 6,
    ivamonotributo: 6,
    monotributo: 6,
    monotributistasocial: 13,
    trabajadorindependientepromovido: 16,
  };
  const id = accepted[v];
  if (!id)
    throw new ApiError(
      409,
      "La condición fiscal debe estar reconocida y ser compatible con factura A.",
    );
  return id;
}
export function assertReissuableOrder(status: string) {
  if (status !== "entregado")
    throw new ApiError(
      409,
      "La operación debe estar entregada y no cancelada para refacturar.",
    );
}
export function receiptCompositionMatches(
  receipt: ArcaAuthorizedReceipt,
  total: number,
  conditionId?: number,
) {
  const expected = vatAmountsFromGross(total, 21);
  const cents = (n: number) => Math.round(n * 100);
  return (
    cents(receipt.totalAmount) === cents(expected.total) &&
    cents(receipt.netAmount) === cents(expected.net) &&
    cents(receipt.vatAmount) === cents(expected.vat) &&
    receipt.exemptAmount === 0 &&
    receipt.nonTaxableAmount === 0 &&
    receipt.otherTaxesAmount === 0 &&
    (conditionId === undefined || receipt.vatConditionId === conditionId) &&
    receipt.vatLines.length === 1 &&
    receipt.vatLines[0].id === 5 &&
    cents(receipt.vatLines[0].base) === cents(expected.net) &&
    cents(receipt.vatLines[0].amount) === cents(expected.vat)
  );
}
export function validateOriginalFiscalReceipt(
  snapshot: ReissueSnapshot,
  remote: ArcaAuthorizedReceipt | null,
) {
  const o = snapshot.original;
  if (
    !remote ||
    remote.cae !== o.cae ||
    remote.pointOfSale !== o.pointOfSale ||
    remote.receiptType !== o.receiptType ||
    remote.receiptNumber !== o.receiptNumber ||
    remote.issueDate !== o.issueDate ||
    Number(remote.customerDocument) !== Number(snapshot.source.document) ||
    !receiptCompositionMatches(remote, snapshot.total) ||
    !conditions[remote.vatConditionId]
  )
    throw new ApiError(
      409,
      "El destinatario, fecha o desglose de IVA original no coincide con ARCA. Requiere conciliación.",
    );
  return conditions[remote.vatConditionId];
}
