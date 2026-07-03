export const BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function localDateIso(date: Date = new Date()): string {
  return isoDateFormatter.format(date);
}
