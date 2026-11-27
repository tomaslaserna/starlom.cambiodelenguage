import { ApiError } from "@/lib/api-response";
import type { ReissueSnapshot } from "@/lib/fiscal-reissue-domain";
export type OperationalReturn = {
  id: string;
  amount: number;
  detail: { id: string; quantity: number; subtotal: number }[];
  accountAdjusted: boolean;
  stockAdjusted: boolean;
  fiscal: boolean;
  className: string;
};
export function netReplacement(
  snapshot: ReissueSnapshot,
  notes: OperationalReturn[],
) {
  if (
    !notes.length ||
    notes.some(
      (n) =>
        n.fiscal ||
        n.className !== "NC" ||
        !n.accountAdjusted ||
        !n.stockAdjusted ||
        !Number.isFinite(n.amount) ||
        n.amount <= 0 ||
        !Array.isArray(n.detail) ||
        !n.detail.length,
    )
  )
    throw new ApiError(
      409,
      "Sólo se pueden conciliar devoluciones internas ya aplicadas a stock y cuenta corriente, sin autorización fiscal.",
    );
  const items = structuredClone(snapshot.items);
  for (const note of notes)
    for (const line of note.detail) {
      const matches = items.filter((i) => i.id === line.id);
      const item = matches[0];
      if (
        matches.length !== 1 ||
        !item ||
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        line.quantity > item.quantity ||
        !Number.isFinite(line.subtotal) ||
        line.subtotal <= 0 ||
        line.subtotal > item.amount ||
        Math.abs(
          line.subtotal - (item.amount * line.quantity) / item.quantity,
        ) > 0.02
      )
        throw new ApiError(
          409,
          "La devolución no coincide inequívocamente con el detalle original. Requiere conciliación.",
        );
      item.quantity = Math.round((item.quantity - line.quantity) * 1000) / 1000;
      item.amount = Math.round((item.amount - line.subtotal) * 100) / 100;
    }
  const replacementTotal =
    (Math.round(snapshot.total * 100) -
      notes.reduce((n, r) => n + Math.round(r.amount * 100), 0)) /
    100;
  const invoiceItems = items.filter((i) => i.quantity > 0);
  if (replacementTotal <= 0 || !invoiceItems.length)
    throw new ApiError(409, "No queda un importe positivo para refacturar.");
  const expectedNet = Math.round((replacementTotal / 1.21) * 100) / 100;
  if (
    Math.abs(invoiceItems.reduce((n, i) => n + i.amount, 0) - expectedNet) >
    0.02
  )
    throw new ApiError(
      409,
      "El neto de las devoluciones no coincide con los importes fiscales.",
    );
  return {
    replacementTotal,
    invoiceItems,
    operationalReturns: structuredClone(notes),
  };
}
