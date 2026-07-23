import type { DetailsHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

export const tableActionItemClass =
  "flex min-h-8 w-full items-center rounded-[7px] border-0 bg-transparent px-2.5 py-1.5 text-left text-[13px] font-semibold leading-5 text-[#27364b] transition-colors hover:bg-[#eef4ff] hover:text-[#1755b8]";

type TableActionMenuProps = Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "children"> & {
  children: ReactNode;
  label?: ReactNode;
  menuClassName?: string;
};

export function TableActionMenu({
  children,
  className,
  label = "Acciones",
  menuClassName,
  ...props
}: TableActionMenuProps) {
  return (
    <details
      className={cn(
        "group min-w-[150px] rounded-[9px] border border-[#b8cdf1] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] open:border-[#8fb1e8] open:shadow-[0_7px_18px_rgba(30,64,175,0.12)]",
        className,
      )}
      {...props}
    >
      <summary className="flex min-h-10 list-none items-center justify-between gap-2 rounded-[8px] px-3.5 py-2 text-[13px] font-bold text-[#1755b8] transition-colors hover:bg-[#f5f8ff] [&::-webkit-details-marker]:hidden">
        <span className="truncate">{label}</span>
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </summary>
      <div className={cn("grid gap-0.5 border-t border-[#dbe7f8] bg-[#fbfdff] p-1.5", menuClassName)}>
        {children}
      </div>
    </details>
  );
}
