"use client";

import { useRouter } from "next/navigation";
import type { Period } from "@/lib/period-range";

type Props = {
  periods: Period[];
  selectedKey: string;
};

export function PeriodPicker({ periods, selectedKey }: Props) {
  const router = useRouter();
  const meses = periods.filter((period) => period.kind === "month");
  const anios = periods.filter((period) => period.kind === "year");
  const label = (period: Period) => (period.kind === "year" ? `Año ${period.key}` : period.key);

  return (
    <select
      aria-label="Elegir período"
      value={selectedKey}
      onChange={(event) => router.push(`/balance?period=${event.target.value}`)}
      className="erp-text-body-sm rounded-[9px] border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2"
    >
      <optgroup label="Meses">
        {meses.map((period) => (
          <option key={period.key} value={period.key}>
            {label(period)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Anual">
        {anios.map((period) => (
          <option key={period.key} value={period.key}>
            {label(period)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
