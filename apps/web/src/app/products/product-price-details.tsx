import { formatCurrency, formatNumber } from "@/lib/format";
import type { ProductPrice } from "@/lib/catalog";

export function ProductPriceDetails({ prices }: { prices: ProductPrice[] }) {
  return (
    <details className="group min-w-[176px] text-left">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-[8px] border border-[#bfdbfe] bg-white px-3 py-1.5 text-xs font-bold text-[#1d4ed8] shadow-[0_2px_8px_rgba(37,99,235,0.05)] transition hover:border-[#60a5fa] hover:bg-[#eff6ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
          <path d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        <span>Ver precios ({prices.length})</span>
        <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24">
          <path d="m7 9 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </summary>
      <div className="mt-2 grid min-w-[290px] gap-0 overflow-hidden rounded-[9px] border border-[#d9e2ef] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
        {prices.map((price) => (
          <div className="grid gap-1 border-b border-[#edf2f7] px-3 py-2.5 last:border-0" key={price.name}>
            <div className="flex items-center justify-between gap-5">
              <span className="truncate text-xs font-bold text-[#334155]">{price.name}</span>
              <span className="whitespace-nowrap font-mono text-xs font-bold text-[#0f172a]">
                {formatCurrency(price.price)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-[11px] font-medium text-[#64748b]">
              <span>Ganancia {formatCurrency(price.profit)}</span>
              <span className="whitespace-nowrap">
                {price.marginPercent === null
                  ? "Sin costo base"
                  : `${formatNumber(price.marginPercent)}% sobre costo`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
