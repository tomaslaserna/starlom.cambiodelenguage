// Helpers puros de tiempos de entrega. SIN imports "@/" ni DB. Autocontenido.

export function summarizeDurations(
  durationsMs: number[],
): { count: number; avgMs: number | null; medianMs: number | null } {
  const valid = durationsMs.filter((value) => Number.isFinite(value) && value >= 0);
  if (!valid.length) return { count: 0, avgMs: null, medianMs: null };
  const avgMs = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { count: valid.length, avgMs, medianMs };
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours >= 1) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}
