type CashItem = { amount: number; date: string | null; kind: string };

// Dates are business-calendar ISO dates. No host timezone or automatic allocation.
export function summarizeCashProjection(items: CashItem[], openingBalance: number, asOf: string) {
  const sum = (rows: CashItem[], kind: string) => rows.filter(item => item.kind === kind)
    .reduce((cents, item) => cents + Math.round(item.amount * 100), 0) / 100;
  const totals = (rows: CashItem[]) => {
    const inflow = sum(rows, 'inflow');
    const outflow = sum(rows, 'outflow');
    return { inflow, outflow, net: Math.round((inflow - outflow) * 100) / 100 };
  };
  const overdue = totals(items.filter(item => item.date && item.date.slice(0, 10) < asOf));
  const undated = totals(items.filter(item => !item.date));
  const horizons = [7, 15, 30].map(days => {
    const end = new Date(`${asOf}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + days);
    const through = end.toISOString().slice(0, 10);
    const flow = totals(items.filter(item => item.date && item.date.slice(0, 10) >= asOf && item.date.slice(0, 10) <= through));
    return { days, through, ...flow, projectedBalance: Math.round((openingBalance + flow.net) * 100) / 100 };
  });
  return { ...totals(items), asOf, openingBalance, overdue, undated, horizons };
}
