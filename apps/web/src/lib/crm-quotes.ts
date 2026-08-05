// Helpers puros para la pestaña Presupuestos del CRM. SIN imports "@/" ni DB,
// para poder testear con node --test importando el .ts directo.

export type VendorQuote = {
  id: string;
  quoteNumber: string;
  clientName: string;
  total: number;
  issueDate: string | null;
  expirationDate: string | null;
  daysRemaining: number | null;
  status: string;
  approvedThisMonth: boolean;
};

export type QuoteBucket = "vigentes" | "por_vencer" | "vencidos" | "aceptados";

export function classifyQuote(
  status: string,
  daysRemaining: number | null,
  approvedThisMonth: boolean,
): QuoteBucket | null {
  if (status === "aceptada") return approvedThisMonth ? "aceptados" : null;
  if (status !== "pendiente") return null;
  if (daysRemaining == null) return "vigentes";
  if (daysRemaining < 0) return "vencidos";
  if (daysRemaining <= 3) return "por_vencer";
  return "vigentes";
}

export type TopQuoteClient = { clientName: string; cantidad: number; aceptados: number };

export function topQuoteClients(quotes: VendorQuote[], n = 5): TopQuoteClient[] {
  const map = new Map<string, TopQuoteClient>();
  for (const quote of quotes) {
    const name = quote.clientName?.trim() || "Sin cliente";
    const entry = map.get(name) ?? { clientName: name, cantidad: 0, aceptados: 0 };
    entry.cantidad += 1;
    if (quote.status === "aceptada") entry.aceptados += 1;
    map.set(name, entry);
  }
  return [...map.values()]
    .sort(
      (a, b) =>
        b.cantidad - a.cantidad ||
        a.aceptados - b.aceptados ||
        a.clientName.localeCompare(b.clientName),
    )
    .slice(0, n);
}

export function formatVigencia(validFrom: string | null, validTo: string | null): string {
  if (validTo) return `Válida hasta ${formatDmy(validTo)}`;
  return "Vigente";
}

function formatDmy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}
