// Matemática pura del ritmo de compra por cliente. SIN imports "@/" ni DB.
// median y customerMetrics están movidos textualmente desde messages.ts.

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function customerMetrics(timestamps: number[]): { average: number; deviation: number; intervals: number } {
  const gaps: number[] = [];
  for (let index = 1; index < timestamps.length; index++) {
    gaps.push(Math.round((timestamps[index] - timestamps[index - 1]) / 86_400_000));
  }
  if (!gaps.length) return { average: 1, deviation: 0, intervals: 0 };

  const med = Math.max(1, median(gaps));
  const processed = gaps.map((gap) =>
    gaps.length >= 3 ? Math.max(med * 0.3, Math.min(med * 3, gap)) : gap,
  );
  let numerator = 0;
  let denominator = 0;
  for (const [index, gap] of processed.entries()) {
    const weight = index + 1;
    numerator += weight * gap;
    denominator += weight;
  }
  const average = Math.max(1, Math.round(numerator / denominator));
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  return { average, deviation: Math.round(Math.sqrt(variance)), intervals: gaps.length };
}

// Alta = primera compra dentro de [start, next). Baja = con >=2 compras, la fecha
// (última + 2×average días) cae en [start, next). Devuelve las fechas en ms.
export function classifyChurn(
  timestamps: number[],
  periodStartMs: number,
  periodNextMs: number,
): { alta: boolean; baja: boolean; firstMs: number | null; lostMs: number | null } {
  const sorted = [...new Set(timestamps)].sort((a, b) => a - b);
  const purchases = sorted.length;
  if (purchases === 0) return { alta: false, baja: false, firstMs: null, lostMs: null };

  const firstMs = sorted[0];
  const lastMs = sorted[purchases - 1];
  const alta = firstMs >= periodStartMs && firstMs < periodNextMs;

  let baja = false;
  let lostMs: number | null = null;
  if (purchases >= 2) {
    const { average } = customerMetrics(sorted);
    lostMs = lastMs + 2 * average * 86_400_000;
    baja = lostMs >= periodStartMs && lostMs < periodNextMs;
  }
  return { alta, baja, firstMs, lostMs };
}
