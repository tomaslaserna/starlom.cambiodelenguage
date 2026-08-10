// Helpers puros para la serie mensual. SIN imports "@/" ni DB.

export type MonthlyPoint = {
  monthKey: string;
  facturacion: number;
  gananciaBruta: number;
  margenPct: number | null;
};

export function marginPercent(bruta: number, facturacion: number): number | null {
  if (!facturacion) return null;
  return (bruta / facturacion) * 100;
}

export function fillYearMonths(
  year: string,
  byKey: Map<string, { facturacion: number; gananciaBruta: number }>,
): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const value = byKey.get(key) ?? { facturacion: 0, gananciaBruta: 0 };
    points.push({
      monthKey: key,
      facturacion: value.facturacion,
      gananciaBruta: value.gananciaBruta,
      margenPct: marginPercent(value.gananciaBruta, value.facturacion),
    });
  }
  return points;
}
