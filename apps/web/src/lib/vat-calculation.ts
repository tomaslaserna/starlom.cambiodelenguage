export const SUPPORTED_SALE_VAT_RATES = [10.5, 21] as const;

export type SaleVatRate = (typeof SUPPORTED_SALE_VAT_RATES)[number];
export type StoredVatRate = 0 | SaleVatRate;

export type VatAmounts = {
  net: number;
  vat: number;
  total: number;
};

export type ValuedDocumentLineInput = {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  netAmount?: number;
};

export type ValuedDocumentLine = VatAmounts & {
  quantity: number;
  netUnitPrice: number;
  vatRate: StoredVatRate;
  vatUnitAmount: number;
  finalUnitPrice: number;
};

export function roundMoney(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return Number((Math.round((safeValue + Number.EPSILON) * 100) / 100).toFixed(2));
}

export function isSaleVatRate(value: unknown): value is SaleVatRate {
  const numericValue = typeof value === "number" ? value : Number(value);
  return numericValue === 10.5 || numericValue === 21;
}

export function normalizeStoredVatRate(value: unknown): StoredVatRate {
  return isSaleVatRate(value) ? Number(value) as SaleVatRate : 0;
}

export function vatAmountsFromNet(netAmount: number, vatRate: StoredVatRate): VatAmounts {
  const net = roundMoney(Math.max(0, netAmount));
  const vat = vatRate > 0 ? roundMoney((net * vatRate) / 100) : 0;
  return { net, vat, total: roundMoney(net + vat) };
}

export function vatAmountsFromGross(totalAmount: number, vatRate: SaleVatRate): VatAmounts {
  const total = roundMoney(Math.max(0, totalAmount));
  const net = roundMoney(total / (1 + vatRate / 100));
  return { net, vat: roundMoney(total - net), total };
}

export function isFinalTotalConsistent(totalAmount: number, netAmount: number, vatRate: SaleVatRate) {
  if (!Number.isFinite(totalAmount) || !Number.isFinite(netAmount)) return false;
  return roundMoney(totalAmount) === vatAmountsFromNet(netAmount, vatRate).total;
}

export function effectiveNetUnitPrice(unitPrice: number, discountPercent = 0) {
  const safeDiscount = Math.min(100, Math.max(0, Number.isFinite(discountPercent) ? discountPercent : 0));
  return roundMoney(Math.max(0, unitPrice) * (1 - safeDiscount / 100));
}

export function valuedDocumentLine(input: ValuedDocumentLineInput, vatRate: StoredVatRate): ValuedDocumentLine {
  const quantity = Math.max(0, Number.isFinite(input.quantity) ? input.quantity : 0);
  const netUnitPrice = effectiveNetUnitPrice(input.unitPrice, input.discountPercent);
  const calculatedNetAmount = roundMoney(netUnitPrice * quantity);
  const suppliedNetAmount = input.netAmount;
  const netAmount = Number.isFinite(suppliedNetAmount) && Number(suppliedNetAmount) >= 0
    ? roundMoney(Number(suppliedNetAmount))
    : calculatedNetAmount;
  const lineAmounts = vatAmountsFromNet(netAmount, vatRate);
  const unitAmounts = vatAmountsFromNet(netUnitPrice, vatRate);
  return {
    ...lineAmounts,
    quantity,
    netUnitPrice,
    vatRate,
    vatUnitAmount: unitAmounts.vat,
    finalUnitPrice: unitAmounts.total,
  };
}

export function valuedDocumentLines(inputs: ValuedDocumentLineInput[], vatRate: StoredVatRate): ValuedDocumentLine[] {
  const lines = inputs.map((input) => valuedDocumentLine(input, vatRate));
  if (vatRate === 0 || lines.length === 0) return lines;

  const summary = vatAmountsFromNet(lines.reduce((sum, line) => sum + line.net, 0), vatRate);
  const allocatedVat = allocateAmountByWeights(summary.vat, lines.map((line) => line.net));
  return lines.map((line, index) => ({
    ...line,
    vat: allocatedVat[index] ?? 0,
    total: roundMoney(line.net + (allocatedVat[index] ?? 0)),
  }));
}

export function valuedDocumentSummary(lines: ValuedDocumentLine[]): VatAmounts {
  const net = roundMoney(lines.reduce((sum, line) => sum + line.net, 0));
  const vat = roundMoney(lines.reduce((sum, line) => sum + line.vat, 0));
  return { net, vat, total: roundMoney(net + vat) };
}

export function allocateAmountByWeights(totalAmount: number, weights: number[]) {
  const total = roundMoney(Math.max(0, totalAmount));
  const safeWeights = weights.map((weight) => Math.max(0, Number.isFinite(weight) ? weight : 0));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (safeWeights.length === 0) return [];
  if (weightTotal <= 0) return safeWeights.map(() => 0);

  const totalCents = Math.round(total * 100);
  const exactShares = safeWeights.map((weight) => (totalCents * weight) / weightTotal);
  const allocatedCents = exactShares.map((share) => Math.floor(share));
  const remainingCents = totalCents - allocatedCents.reduce((sum, cents) => sum + cents, 0);
  const remainderOrder = exactShares
    .map((share, index) => ({ index, remainder: share - allocatedCents[index] }))
    .sort((left, right) => right.remainder - left.remainder || right.index - left.index);

  for (let index = 0; index < remainingCents; index += 1) {
    allocatedCents[remainderOrder[index].index] += 1;
  }
  return allocatedCents.map((cents) => cents / 100);
}

export function arcaVatRateId(vatRate: SaleVatRate) {
  return vatRate === 10.5 ? 4 : 5;
}

export function formatVatRate(vatRate: StoredVatRate) {
  return String(vatRate).replace(".", ",");
}

export function requireValuedRemittanceVatRate(
  value: unknown,
  context: { desiredDocument: string; receiptType?: unknown; fiscalReceiptType?: unknown },
): SaleVatRate {
  const vatRate = normalizeStoredVatRate(value);
  if (vatRate === 0) {
    throw new Error("El remito valorizado no tiene una alicuota IVA persistida. Use el remito sin precios o revise la venta.");
  }

  const desiredDocument = context.desiredDocument
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const desiredVatRate = desiredDocument === "remito"
    ? 10.5
    : ["factura", "factura_a", "factura_b", "a", "b"].includes(desiredDocument)
      ? 21
      : null;
  const fiscalReceiptType = Number(context.fiscalReceiptType);
  const receiptType = Number(context.receiptType);
  const effectiveReceiptType = Number.isInteger(fiscalReceiptType) && fiscalReceiptType > 0
    ? fiscalReceiptType
    : Number.isInteger(receiptType) && receiptType > 0
      ? receiptType
      : 0;
  const receiptVatRate = [1, 2, 3, 6, 7, 8].includes(effectiveReceiptType)
    ? 21
    : [11, 12, 13].includes(effectiveReceiptType)
      ? 0
      : null;

  if (desiredVatRate !== null && receiptVatRate !== null && desiredVatRate !== receiptVatRate) {
    throw new Error("El comprobante deseado y el tipo de comprobante persistido tienen alicuotas incompatibles. Use el remito sin precios y revise la venta.");
  }

  const expectedVatRate = receiptVatRate ?? desiredVatRate;
  if (expectedVatRate !== 10.5 && expectedVatRate !== 21) {
    throw new Error("El remito valorizado no tiene un comprobante persistido compatible con IVA 10,5% o 21%. Use el remito sin precios y revise la venta.");
  }
  if (vatRate !== expectedVatRate) {
    throw new Error(
      `La alicuota IVA persistida (${formatVatRate(vatRate)}%) no coincide con el comprobante de la venta (${formatVatRate(expectedVatRate)}%). Use el remito sin precios y revise la venta.`,
    );
  }
  return vatRate;
}
