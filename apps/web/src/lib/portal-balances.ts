export type PortalSaleBalance = {
  id: string;
  client_id: string;
  date: string;
  outstanding: string;
};

const money = (value: number) => Math.round(value * 100) / 100;

export function reconcileToAccountBalance<T extends PortalSaleBalance>(
  sales: T[],
  balancesByClient: Map<string, number>,
): T[] {
  const remaining = new Map(Array.from(balancesByClient, ([id, value]) => [id, Math.max(0, value)]));
  const reconciled = [...sales];

  // The account balance is authoritative. A positive remainder belongs to the
  // newest delivered remittances because historical payments settle FIFO.
  for (let index = reconciled.length - 1; index >= 0; index -= 1) {
    const sale = reconciled[index];
    const candidate = Math.max(0, Number(sale.outstanding) || 0);
    const clientBalance = Math.max(0, remaining.get(sale.client_id) ?? 0);
    const outstanding = Math.min(candidate, clientBalance);
    remaining.set(sale.client_id, money(clientBalance - outstanding));
    reconciled[index] = { ...sale, outstanding: String(money(outstanding)) };
  }

  return reconciled;
}

export function selectionIsOldestFirst(openSaleIds: string[], selectedSaleIds: string[]) {
  const selected = new Set(selectedSaleIds);
  return selected.size === selectedSaleIds.length
    && selectedSaleIds.length > 0
    && openSaleIds.slice(0, selected.size).every((id) => selected.has(id));
}
