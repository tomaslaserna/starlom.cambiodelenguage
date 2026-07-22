export type ProductProfit = {
  amount: number;
  percentOnCost: number | null;
};

function roundToCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateProductProfit(cost: number, price: number): ProductProfit {
  const safeCost = Number.isFinite(cost) ? cost : 0;
  const safePrice = Number.isFinite(price) ? price : 0;
  const amount = roundToCents(safePrice - safeCost);

  return {
    amount,
    percentOnCost: safeCost > 0 ? roundToCents((amount / safeCost) * 100) : null,
  };
}
