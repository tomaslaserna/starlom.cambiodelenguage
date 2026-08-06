// Helpers puros de períodos para balances. SIN imports "@/" ni DB, para testear
// con node --test importando el .ts directo. Solo aritmética de calendario.

export type Period = { kind: "month"; key: string } | { kind: "year"; key: string };
export type PeriodBounds = { previousStart: string; currentStart: string; nextStart: string };

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "YYYY-MM" desplazado delta meses -> "YYYY-MM"
function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const zero = year * 12 + (month - 1) + delta;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  return `${y}-${pad2(m)}`;
}

export function parsePeriod(raw: string | null | undefined, fallbackMonthKey: string): Period {
  const value = (raw ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(value)) return { kind: "month", key: value };
  if (/^\d{4}$/.test(value)) return { kind: "year", key: value };
  return { kind: "month", key: fallbackMonthKey };
}

export function periodBounds(period: Period): PeriodBounds {
  if (period.kind === "year") {
    const year = Number(period.key);
    return {
      previousStart: `${year - 1}-01-01`,
      currentStart: `${year}-01-01`,
      nextStart: `${year + 1}-01-01`,
    };
  }
  return {
    previousStart: `${shiftMonthKey(period.key, -1)}-01`,
    currentStart: `${period.key}-01`,
    nextStart: `${shiftMonthKey(period.key, 1)}-01`,
  };
}

export function periodLabel(period: Period): string {
  if (period.kind === "year") return `Año ${period.key}`;
  const [year, month] = period.key.split("-").map(Number);
  return `${MESES[month - 1]} ${year}`;
}

export function availablePeriods(earliestMonthKey: string, currentMonthKey: string): Period[] {
  const months: Period[] = [];
  const years = new Set<string>();
  let cursor = currentMonthKey;
  // desc desde el mes actual hasta el más antiguo (guard de 600 iteraciones)
  for (let i = 0; i < 600 && cursor >= earliestMonthKey; i++) {
    months.push({ kind: "month", key: cursor });
    years.add(cursor.slice(0, 4));
    cursor = shiftMonthKey(cursor, -1);
  }
  const yearPeriods: Period[] = [...years]
    .sort((a, b) => Number(b) - Number(a))
    .map((key) => ({ kind: "year", key }));
  return [...months, ...yearPeriods];
}
