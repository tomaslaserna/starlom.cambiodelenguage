import Link from "next/link";
import { cn } from "@/components/ui";

type PaginationLinksProps = {
  basePath: string;
  query: string;
  page: number;
  totalPages: number;
  extraParams?: Record<string, string | null | undefined>;
  itemLabel?: string;
  pageSize?: number;
  totalItems?: number;
};

function href(
  basePath: string,
  query: string,
  page: number,
  extraParams: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) params.set(key, value);
  }
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

export function PaginationLinks({
  basePath,
  query,
  page,
  totalPages,
  extraParams = {},
  itemLabel = "registros",
  pageSize,
  totalItems,
}: PaginationLinksProps) {
  const previousDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  if (pageSize !== undefined && totalItems !== undefined) {
    const firstVisibleItem = totalItems > 0 ? (page - 1) * pageSize + 1 : 0;
    const lastVisibleItem = Math.min(page * pageSize, totalItems);

    return (
      <nav
        aria-label="Paginacion"
        className="erp-text-body-sm flex flex-col gap-3 border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="font-medium text-[#64748b]">
          Mostrando {firstVisibleItem}-{lastVisibleItem} de {totalItems} {itemLabel}
        </span>
        <div className="flex items-center gap-2">
          <span className="hidden min-h-9 items-center rounded-[8px] border border-[#d9e2ef] bg-white px-3 font-semibold text-[#334155] shadow-[var(--shadow-xs)] sm:inline-flex">
            {pageSize} por página
          </span>
          <Link
            aria-disabled={previousDisabled}
            aria-label="Pagina anterior"
            className={cn(
              "inline-flex min-h-9 items-center justify-center rounded-[8px] border border-[#d9e2ef] bg-white px-3 font-semibold text-[#334155] shadow-[var(--shadow-xs)] transition-[background-color,border-color,color]",
              previousDisabled
                ? "pointer-events-none text-[#cbd5e1]"
                : "hover:border-[#93b4e8] hover:bg-[#f4f8ff] hover:text-[#1d4ed8]",
            )}
            href={href(basePath, query, Math.max(1, page - 1), extraParams)}
          >
            <span aria-hidden="true">←</span>
            <span className="ml-2 hidden sm:inline">Anterior</span>
          </Link>
          <span
            aria-current="page"
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-[8px] bg-[#2563eb] px-3 font-bold text-white shadow-[0_6px_14px_rgba(37,99,235,0.2)]"
          >
            {page}
          </span>
          <Link
            aria-disabled={nextDisabled}
            aria-label="Pagina siguiente"
            className={cn(
              "inline-flex min-h-9 items-center justify-center rounded-[8px] border border-[#d9e2ef] bg-white px-3 font-semibold text-[#334155] shadow-[var(--shadow-xs)] transition-[background-color,border-color,color]",
              nextDisabled
                ? "pointer-events-none text-[#cbd5e1]"
                : "hover:border-[#93b4e8] hover:bg-[#f4f8ff] hover:text-[#1d4ed8]",
            )}
            href={href(basePath, query, Math.min(totalPages, page + 1), extraParams)}
          >
            <span className="mr-2 hidden sm:inline">Siguiente</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Paginacion"
      className="erp-text-body-sm flex flex-col gap-3 border-t border-[color:var(--border)] px-4 py-4 md:flex-row md:items-center md:justify-between"
    >
      <span className="text-[color:var(--muted)]">
        Pagina {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <Link
          aria-disabled={previousDisabled}
          aria-label="Pagina anterior"
          className={cn(
            "rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 transition-colors",
            previousDisabled ? "pointer-events-none opacity-45" : "hover:bg-[color:var(--hover)]",
          )}
          href={href(basePath, query, Math.max(1, page - 1), extraParams)}
        >
          Anterior
        </Link>
        <Link
          aria-disabled={nextDisabled}
          aria-label="Pagina siguiente"
          className={cn(
            "rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 transition-colors",
            nextDisabled ? "pointer-events-none opacity-45" : "hover:bg-[color:var(--hover)]",
          )}
          href={href(basePath, query, Math.min(totalPages, page + 1), extraParams)}
        >
          Siguiente
        </Link>
      </div>
    </nav>
  );
}
