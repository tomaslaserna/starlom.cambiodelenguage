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
        "min-h-[var(--control-height-md)] rounded-[var(--radius-md)] border bg-[color:var(--field)] px-3 text-sm text-[color:var(--foreground)] shadow-[var(--shadow-xs)] outline-none transition-colors disabled:opacity-60",
        invalid ? "border-[color:var(--danger)]" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]",
        className,
      )}
    />
  );
}
