export type OperatingCostKind = "fijo" | "variable" | "unico";

export type OperatingCostSchedule = {
  startMonth: string;
  durationMonths: number | null;
  overrideIncluded?: boolean | null;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizeMonthKey(value: string) {
  const month = value.trim().slice(0, 7);
  if (!MONTH_PATTERN.test(month)) throw new Error("El mes debe tener formato AAAA-MM");
  return month;
}

export function monthDistance(from: string, to: string) {
  const normalizedFrom = normalizeMonthKey(from);
  const normalizedTo = normalizeMonthKey(to);
  const [fromYear, fromMonth] = normalizedFrom.split("-").map(Number);
  const [toYear, toMonth] = normalizedTo.split("-").map(Number);
  return (toYear - fromYear) * 12 + toMonth - fromMonth;
}

export function operatingCostAppliesToMonth(schedule: OperatingCostSchedule, month: string) {
  if (typeof schedule.overrideIncluded === "boolean") return schedule.overrideIncluded;
  const distance = monthDistance(schedule.startMonth, month);
  if (distance < 0) return false;
  if (schedule.durationMonths === null) return distance === 0;
  return distance < schedule.durationMonths;
}

export function parseOperatingCostKind(value: string): OperatingCostKind {
  const normalized = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized === "fijo" || normalized === "variable" || normalized === "unico") return normalized;
  throw new Error("La etiqueta debe ser fijo, variable o único");
}

export function parseDurationMonths(value: string, kind: OperatingCostKind) {
  if (kind === "unico") return 1;
  if (value === "indefinite") return null;
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 1 || duration > 120) {
    throw new Error("La duración debe estar entre 1 y 120 meses");
  }
  return duration;
}
