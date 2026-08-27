import type { SupervisorCustomerHistory } from "@/lib/supervisor-lab/read-model";

export type SupervisorProductPattern = {
  productId: string | null;
  name: string;
  purchaseCount: number;
  totalQuantity: number;
  averageQuantity: number;
  lastPurchase: string;
  customers: string[];
};

export function summarizeCustomerProductPatterns(
  histories: SupervisorCustomerHistory[],
): SupervisorProductPattern[] {
  const products = new Map<string, SupervisorProductPattern>();

  for (const history of histories) {
    for (const purchase of history.purchases) {
      const seenInPurchase = new Set<string>();
      for (const item of purchase.items) {
        const key = item.productId ?? item.name.trim().toUpperCase();
        const current = products.get(key) ?? {
          productId: item.productId,
          name: item.name,
          purchaseCount: 0,
          totalQuantity: 0,
          averageQuantity: 0,
          lastPurchase: purchase.date,
          customers: [],
        };
        current.totalQuantity += item.quantity;
        if (!seenInPurchase.has(key)) {
          current.purchaseCount += 1;
          seenInPurchase.add(key);
        }
        if (purchase.date > current.lastPurchase) current.lastPurchase = purchase.date;
        if (!current.customers.includes(history.customerName)) current.customers.push(history.customerName);
        products.set(key, current);
      }
    }
  }

  return [...products.values()]
    .map((product) => ({
      ...product,
      averageQuantity: product.purchaseCount > 0
        ? Number((product.totalQuantity / product.purchaseCount).toFixed(2))
        : 0,
    }))
    .sort((a, b) =>
      b.purchaseCount - a.purchaseCount ||
      b.lastPurchase.localeCompare(a.lastPurchase) ||
      a.name.localeCompare(b.name),
    );
}
