export type QuoteVatRate = 0 | 10.5 | 21;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateQuoteTotals(subtotal: number, vatRate: QuoteVatRate) {
  const safeSubtotal = roundMoney(Math.max(0, Number.isFinite(subtotal) ? subtotal : 0));
  const vatAmount = vatRate > 0 ? roundMoney((safeSubtotal * vatRate) / 100) : 0;
  return {
    subtotal: safeSubtotal,
    vatAmount,
    total: roundMoney(safeSubtotal + vatAmount),
  };
}
