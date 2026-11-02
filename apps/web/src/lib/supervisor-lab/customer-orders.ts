import { currentMonth, monthRange, shiftMonthKey } from "../month-range.ts";

export type CustomerOrderRecord = {
  id: string;
  number: string;
  date: string | null;
  createdDate: string;
  status: string;
  total: number;
};

/** All aggregates use order headers, never item rows. Cancelled orders are excluded. */
export function summarizeCustomerOrders(
  orders: readonly CustomerOrderRecord[],
  period = shiftMonthKey(currentMonth(), -1),
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Mes inválido");
  const range = monthRange(period);
  const active = orders.filter((order) => order.status !== "cancelado");
  const byDate = [...active].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? "") || b.createdDate.localeCompare(a.createdDate) || b.id.localeCompare(a.id),
  );
  const delivered = byDate.filter((order) => order.status === "entregado");
  const dates = [...new Set(delivered.map((order) => order.date).filter((date): date is string => Boolean(date)))].sort();
  const gaps = dates.slice(1).map((date, index) =>
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dates[index]}T00:00:00Z`)) / 86_400_000,
  );
  const inPeriod = (date: string | null) => date !== null && date >= range.start && date < range.endExclusive;
  const aggregate = (rows: CustomerOrderRecord[]) => ({
    count: rows.length,
    total: rows.reduce((sum, row) => sum + Math.round(row.total * 100), 0) / 100,
  });
  const deliveredTotals = aggregate(delivered);
  return {
    period: range,
    currency: "ARS",
    frequency: {
      basis: "Días distintos con compras entregadas; promedio simple de intervalos consecutivos",
      purchaseDays: dates.length,
      intervals: gaps.length,
      averageDays: gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length * 10) / 10 : null,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
    },
    latestOrder: byDate[0] ?? null,
    latestDeliveredOrder: delivered[0] ?? null,
    spending: {
      basis: "Importe comercial por pedido entregado, con ajustes; no es deuda ni precio vigente",
      count: deliveredTotals.count,
      total: deliveredTotals.total,
      averageOrderAmount: deliveredTotals.count ? Math.round(deliveredTotals.total * 100 / deliveredTotals.count) / 100 : null,
      firstDate: delivered.at(-1)?.date ?? null,
      lastDate: delivered[0]?.date ?? null,
    },
    byOrderDate: aggregate(active.filter((order) => inPeriod(order.date))),
    byCreationDate: aggregate(active.filter((order) => inPeriod(order.createdDate))),
    deliveredInPeriod: aggregate(delivered.filter((order) => inPeriod(order.date))),
    clarification: "El período se cuenta por fecha comercial (sale_date). La fecha de carga es una medida distinta: informar ambas si difieren. Último pedido incluye cargados y confirmados; última compra entregada solo entregados. Los cancelados no se suman. Cero pedidos no permite trasladar el período al último mes con actividad.",
  };
}
