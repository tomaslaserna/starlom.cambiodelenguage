import type { SelectHTMLAttributes } from "react";
import { cn } from "./utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export function Select({ className, invalid, ...props }: SelectProps) {
  return (
    <select
      {...props}
      aria-invalid={invalid ? true : props["aria-invalid"]}
      className={cn(
        "erp-text-body-sm min-h-[var(--control-height-md)] rounded-[8px] border bg-white px-3 font-normal text-[#172033] shadow-[var(--shadow-control)] outline-none transition-[background-color,border-color,box-shadow] disabled:bg-[#f4f6f8] disabled:text-[#7b8797] disabled:opacity-75",
        invalid ? "border-[color:var(--danger)]" : "border-[color:var(--border-strong)] hover:border-[#9eacbd] focus:border-[color:var(--accent)]",
        className,
      )}
      suppressHydrationWarning
    />
  );
}
