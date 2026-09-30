type AllocatableRemittance = {
  saleId: string;
  outstanding: number;
};

function money(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function distributeCustomerPayment(
  remittances: AllocatableRemittance[],
  paymentAmount: number,
) {
  let remaining = Math.max(0, money(paymentAmount));
  const amounts: Record<string, string> = {};

  for (const remittance of remittances) {
    if (remaining <= 0) break;
    const outstanding = Math.max(0, money(remittance.outstanding));
    const applied = money(Math.min(remaining, outstanding));
    if (applied <= 0) continue;
    amounts[remittance.saleId] = applied.toFixed(2);
    remaining = money(remaining - applied);
  }

  return amounts;
}
