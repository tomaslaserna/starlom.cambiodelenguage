export function currentMonth(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export type MonthRange = {
  month: string;
  start: string;
  endExclusive: string;
};

export function monthRange(month: string): MonthRange {
  const normalized = /^(\d{4})-(\d{2})$/.test((month ?? "").trim())
    ? (month ?? "").trim()
    : currentMonth();
  const [year, monthNum] = normalized.split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-01`;
  const nextYear = monthNum === 12 ? year + 1 : year;
  const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
  const endExclusive = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
  return { month: normalized, start, endExclusive };
}
