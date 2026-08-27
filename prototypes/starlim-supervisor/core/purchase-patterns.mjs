const DAY_MS = 86_400_000;

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function purchasePattern(purchases, now = new Date()) {
  const ordered = [...purchases]
    .filter((purchase) => purchase?.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!ordered.length) return null;

  const uniqueDays = [...new Set(ordered.map((purchase) => String(purchase.date).slice(0, 10)))];
  const intervals = uniqueDays.slice(1).map((date, index) =>
    Math.max(1, Math.round((new Date(`${date}T12:00:00Z`) - new Date(`${uniqueDays[index]}T12:00:00Z`)) / DAY_MS)),
  );
  const typicalDays = intervals.length ? Math.max(1, Math.round(median(intervals))) : null;
  const mean = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0;
  const deviation = intervals.length
    ? Math.sqrt(intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length)
    : null;
  const lastPurchaseDate = uniqueDays.at(-1);
  const daysSinceLastPurchase = Math.max(
    0,
    Math.floor((new Date(now.toISOString().slice(0, 10) + "T12:00:00Z") - new Date(`${lastPurchaseDate}T12:00:00Z`)) / DAY_MS),
  );
  const expectedDate = typicalDays
    ? new Date(new Date(`${lastPurchaseDate}T12:00:00Z`).getTime() + typicalDays * DAY_MS).toISOString().slice(0, 10)
    : null;
  const overdueDays = typicalDays ? Math.max(0, daysSinceLastPurchase - typicalDays) : 0;
  const confidence = confidenceLevel(uniqueDays.length, typicalDays, deviation);

  const productTotals = new Map();
  for (const purchase of ordered) {
    for (const item of purchase.items ?? []) {
      const key = item.productId || String(item.name ?? "").trim().toUpperCase();
      if (!key) continue;
      const current = productTotals.get(key) ?? { productId: item.productId ?? null, name: item.name, quantity: 0, appearances: 0 };
      current.quantity += Number(item.quantity ?? 0);
      current.appearances += 1;
      productTotals.set(key, current);
    }
  }
  const habitualProducts = [...productTotals.values()]
    .map((item) => ({ ...item, averageQuantity: Number((item.quantity / item.appearances).toFixed(2)) }))
    .sort((a, b) => b.appearances - a.appearances || b.quantity - a.quantity)
    .slice(0, 8);

  return {
    purchaseCount: uniqueDays.length,
    lastPurchaseDate,
    daysSinceLastPurchase,
    typicalDays,
    deviationDays: deviation == null ? null : Number(deviation.toFixed(1)),
    expectedDate,
    overdueDays,
    confidence,
    habitualProducts,
  };
}

export function confidenceLevel(purchaseCount, typicalDays, deviation) {
  if (purchaseCount < 3 || !typicalDays || deviation == null) return "low";
  const variation = deviation / typicalDays;
  if (purchaseCount >= 5 && variation <= 0.35) return "high";
  if (purchaseCount >= 3 && variation <= 0.75) return "medium";
  return "low";
}

export function opportunityScore(pattern) {
  if (!pattern?.typicalDays) return 0;
  const overdueRatio = pattern.overdueDays / pattern.typicalDays;
  const confidenceWeight = { high: 24, medium: 14, low: 4 }[pattern.confidence] ?? 0;
  return Math.max(0, Math.round(overdueRatio * 70 + confidenceWeight));
}

export function rankContactOpportunities(customers, now = new Date()) {
  return customers
    .map((customer) => {
      const pattern = purchasePattern(customer.purchases ?? [], now);
      const score = opportunityScore(pattern);
      return {
        customerId: customer.id,
        customerName: customer.name,
        seller: customer.seller ?? "",
        pattern,
        score,
        reason: explainOpportunity(pattern),
      };
    })
    .filter((item) => item.pattern && (item.pattern.overdueDays > 0 || item.score >= 18))
    .sort((a, b) => b.score - a.score || b.pattern.daysSinceLastPurchase - a.pattern.daysSinceLastPurchase);
}

export function explainOpportunity(pattern) {
  if (!pattern?.typicalDays) return "Todavía no hay historial suficiente para estimar una frecuencia.";
  if (pattern.overdueDays > 0) {
    return `Compra aproximadamente cada ${pattern.typicalDays} días y lleva ${pattern.daysSinceLastPurchase} días sin comprar (${pattern.overdueDays} de demora).`;
  }
  return `Su próxima compra se estima para ${pattern.expectedDate}; conviene realizar seguimiento preventivo.`;
}
