"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui";
import type { ProductPrice } from "@/lib/catalog";
import { formatCurrency, formatNumber } from "@/lib/format";

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M3.5 12s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function ProductPriceDetails({
  prices,
  productName,
}: {
  prices: ProductPrice[];
  productName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <Button
        className="min-w-[156px]"
        leadingIcon={<EyeIcon />}
        onClick={() => dialogRef.current?.showModal()}
        size="sm"
        type="button"
        variant="outline"
      >
        Ver precios ({prices.length})
      </Button>

      <dialog
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-[560px] overflow-hidden rounded-[14px] border border-[#dbe3ec] bg-white p-0 text-[#172033] shadow-[0_30px_80px_rgba(15,23,42,0.28)] backdrop:bg-[#0f172a]/45 backdrop:backdrop-blur-[1px]"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        ref={dialogRef}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#e8edf3] px-5 py-4">
          <div className="min-w-0">
            <p className="erp-text-caption font-bold uppercase text-[#2563eb]">Precios y margen</p>
            <h2 className="mt-1 break-words text-lg font-extrabold text-[#0f172a]" id={titleId}>
              {productName}
            </h2>
          </div>
          <button
            aria-label="Cerrar detalle"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dbe3ec] text-xl text-[#64748b] transition hover:bg-[#f8fafc]"
            onClick={closeDialog}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="grid max-h-[60vh] gap-2 overflow-y-auto p-5">
          {prices.map((price) => (
            <div
              className="grid gap-2 rounded-[10px] border border-[#e2e8f0] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={price.name}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-[#334155]">{price.name}</div>
                <div className="mt-1 text-xs font-medium text-[#64748b]">
                  Ganancia {formatCurrency(price.profit)}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="whitespace-nowrap font-mono text-sm font-bold text-[#0f172a]">
                  {formatCurrency(price.price)}
                </span>
                <span className="whitespace-nowrap rounded-full bg-[#ecfdf5] px-2.5 py-1 text-xs font-bold text-[#047857]">
                  {price.marginPercent === null
                    ? "Sin costo base"
                    : `${formatNumber(price.marginPercent)}%`}
                </span>
              </div>
            </div>
          ))}
        </div>

        <footer className="flex justify-end border-t border-[#e8edf3] px-5 py-4">
          <Button onClick={closeDialog} type="button">
            Cerrar
          </Button>
        </footer>
      </dialog>
    </>
  );
}
