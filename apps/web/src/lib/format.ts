const ARGENTINE_NUMBER_FORMATTER = new Intl.NumberFormat("es-AR");
const ARGENTINE_MONEY_FORMATTER = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number) {
  return ARGENTINE_NUMBER_FORMATTER.format(value);
}

/** Formato monetario único de todo el sistema: -$ 1.234,56. */
export function formatCurrency(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const sign = safeValue < 0 ? "-" : "";
  return `${sign}$ ${ARGENTINE_MONEY_FORMATTER.format(Math.abs(safeValue))}`;
}

function groupIntegerDigits(value: string) {
  const normalized = value.replace(/^0+(?=\d)/, "") || "0";
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Normaliza texto escrito o pegado como pesos argentinos. Devuelve el valor
 * visible y el decimal con punto que esperan FormData, Zod y Postgres.
 */
export function normalizeCurrencyInput(value: string | number, finalize = false) {
  const source = String(value ?? "").trim();
  if (!source) return { display: "", raw: "" };

  const negative = source.includes("-");
  const cleaned = source.replace(/[$\s-]/g, "").replace(/[^\d.,]/g, "");
  const commaIndex = cleaned.lastIndexOf(",");
  const dotMatches = cleaned.match(/\./g) ?? [];
  const lastDotIndex = cleaned.lastIndexOf(".");
  const dotLooksDecimal = commaIndex < 0
    && dotMatches.length === 1
    && lastDotIndex >= 0
    && cleaned.length - lastDotIndex - 1 <= 2;
  const decimalIndex = commaIndex >= 0 ? commaIndex : dotLooksDecimal ? lastDotIndex : -1;
  const integerSource = decimalIndex >= 0 ? cleaned.slice(0, decimalIndex) : cleaned;
  const decimalSource = decimalIndex >= 0 ? cleaned.slice(decimalIndex + 1) : "";
  const integerDigits = integerSource.replace(/\D/g, "") || "0";
  const decimalDigits = decimalSource.replace(/\D/g, "").slice(0, 2);
  const visibleDecimals = decimalIndex >= 0 || finalize
    ? (finalize ? decimalDigits.padEnd(2, "0") : decimalDigits)
    : "";
  const sign = negative ? "-" : "";
  const rawDecimals = decimalDigits ? `.${decimalDigits}` : "";

  return {
    display: `${sign}${groupIntegerDigits(integerDigits)}${decimalIndex >= 0 || finalize ? `,${visibleDecimals}` : ""}`,
    raw: `${sign}${integerDigits.replace(/^0+(?=\d)/, "")}${rawDecimals}`,
  };
}

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

function parseDateValue(value: string) {
  const trimmedValue = value.trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue);
  const normalizedValue = isDateOnly
    ? `${trimmedValue}T00:00:00`
    : trimmedValue
        .replace(/^(\d{4}-\d{2}-\d{2})\s/, "$1T")
        .replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("es-AR").format(date);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date) return value;

  const parts = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("day")}/${part("month")}/${part("year")} · ${part("hour")}:${part("minute")}`;
}
