import type { StatementLine, StatementMovement } from "./customer-accounts";

export type StatementCategory = "remito" | "pago" | "nota_credito" | "nota_debito" | "ajuste";

export function statementCategory(line: StatementMovement): StatementCategory {
  const description = line.description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/anulad|revers|ajuste|saldo inicial/.test(description)) return "ajuste";
  if (line.internalDocumentId || line.fiscalDocumentId || /nota de (credito|debito)|devolucion/.test(description) || line.kind === "nota_credito" || line.kind === "nota_debito") {
    return line.debit > line.credit ? "nota_debito" : "nota_credito";
  }
  if (/^(cobro|pago)\b|^saldo a favor\b/.test(description)) return "pago";
  if (line.debit > 0 && (line.saleId || /^(remito|venta)\b/.test(description))) return "remito";
  // An unlinked historical debit is not necessarily a sale/remito.
  return "ajuste";
}

const presentation = {
  remito: { label: "Remito", className: "bg-blue-50 text-blue-700 ring-blue-100" },
  pago: { label: "Pago", className: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  nota_credito: { label: "Nota de crédito", className: "bg-amber-50 text-amber-800 ring-amber-100" },
  nota_debito: { label: "Nota de débito", className: "bg-orange-50 text-orange-800 ring-orange-100" },
  ajuste: { label: "Ajuste", className: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export function statementMovementPresentation(line: StatementMovement) {
  const category = statementCategory(line);
  const firstPart = line.description.split("|")[0].trim();
  const historicalReference = category === "remito" && !line.saleId ? line.description.match(/REM-\d{4}-\d+/i)?.[0] : null;
  const title = category === "remito" && line.deliveryNumber
    ? `Remito #${String(line.deliveryNumber).padStart(4, "0")}`
    : historicalReference ? `Remito histórico ${historicalReference}`
    : category === "pago"
      ? firstPart.replace(/^Cobro(?: aprobado)?\s*-?\s*/i, "Pago · ") || "Pago registrado"
      : firstPart || presentation[category].label;
  const subtitle = category === "remito"
    ? !line.saleId ? "Venta histórica registrada" : line.hasFiscalPdf ? "Venta · Factura disponible" : "Venta · Remito"
    : category === "pago"
      ? line.description.split("|").slice(1, 2).join("").trim() || "Registrado en cuenta corriente"
      : category === "nota_credito" || category === "nota_debito"
        ? line.fiscalDocumentId ? "Nota interna · Documento fiscal disponible" : line.internalDocumentId ? "Documento interno" : "Movimiento registrado"
        : "Movimiento de cuenta corriente";
  return { ...presentation[category], category, title, subtitle, amount: Math.round((line.debit - line.credit) * 100) / 100 };
}

/** Totals are derived from ledger movements, never from visible/type-filtered rows. */
export function summarizeStatement(lines: StatementLine[]) {
  const totals = { sales: 0, payments: 0, creditNotes: 0, other: 0 };
  for (const line of lines) {
    const category = statementCategory(line);
    const amount = line.debit - line.credit;
    if (category === "remito") totals.sales += amount;
    else if (category === "pago") totals.payments -= amount;
    else if (category === "nota_credito") totals.creditNotes -= amount;
    else totals.other += amount;
  }
  return Object.fromEntries(Object.entries(totals).map(([key, amount]) => [key, Math.round(amount * 100) / 100])) as typeof totals;
}

export function filterStatementLines(lines: StatementLine[], filter: "todos" | "notas" | StatementCategory) {
  if (filter === "todos") return lines;
  return lines.filter((line) => {
    const category = statementCategory(line);
    return filter === "notas" ? category === "nota_credito" || category === "nota_debito" : category === filter;
  });
}
