import Link from "next/link";
import { cn } from "@/components/ui";

type PaginationLinksProps = {
  basePath: string;
  query: string;
  page: number;
  totalPages: number;
  extraParams?: Record<string, string | null | undefined>;
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
}: PaginationLinksProps) {
  const previousDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

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
