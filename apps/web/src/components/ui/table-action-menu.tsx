import type { DetailsHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

export const tableActionItemClass =
  "flex h-[var(--control-height-sm)] min-h-[var(--control-height-sm)] w-full items-center rounded-[7px] border-0 bg-transparent px-2.5 text-left text-[13px] font-semibold leading-5 text-[#27364b] transition-colors hover:bg-[#eef4ff] hover:text-[#1755b8]";

type TableActionMenuProps = Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "children"> & {
  children: ReactNode;
  compact?: boolean;
  label?: ReactNode;
  menuClassName?: string;
};

export function TableActionMenu({
  children,
  className,
  compact = false,
  label = "Acciones",
  menuClassName,
  ...props
}: TableActionMenuProps) {
  return (
    <details
      className={cn(
        "group rounded-[9px] border border-[#b8cdf1] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] open:border-[#8fb1e8] open:shadow-[0_7px_18px_rgba(30,64,175,0.12)]",
        compact ? "w-11 min-w-11" : "min-w-[150px]",
        className,
      )}
      {...props}
    >
      <summary className={cn(
        "flex min-h-10 list-none items-center gap-2 rounded-[8px] py-2 text-[13px] font-bold text-[#1755b8] transition-colors hover:bg-[#f5f8ff] [&::-webkit-details-marker]:hidden",
        compact ? "justify-center px-2" : "justify-between px-3.5",
      )}>
        <span className="truncate">{label}</span>
        {compact ? null : (
          <svg
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        )}
      </summary>
      <div className={cn("grid gap-0.5 border-t border-[#dbe7f8] bg-[#fbfdff] p-1.5", menuClassName)}>
        {children}
      </div>
    </details>
  );
}
