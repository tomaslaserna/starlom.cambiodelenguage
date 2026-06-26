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
        "erp-text-body-sm min-h-[var(--control-height-md)] rounded-[var(--radius-md)] border bg-[color:var(--field)] px-3 text-[color:var(--foreground)] shadow-[var(--shadow-control)] outline-none transition-[background-color,border-color,box-shadow] disabled:bg-[color:var(--panel-muted)] disabled:opacity-70",
        invalid ? "border-[color:var(--danger)]" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)] focus:border-[color:var(--accent)]",
        className,
      )}
    />
  );
}
