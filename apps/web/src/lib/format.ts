export function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR").format(value);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
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
