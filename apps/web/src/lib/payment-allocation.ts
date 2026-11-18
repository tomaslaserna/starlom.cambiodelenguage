const money = (value: number) => Math.round(value * 100) / 100;

export function suggestPaymentAllocation(received: number, alreadyApplied: number, outstanding: number) {
  const available = money(Math.max(0, received - alreadyApplied));
  const pending = money(Math.max(0, outstanding));
  return money(Math.min(available, pending));
}
