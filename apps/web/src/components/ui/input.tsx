import type { InputHTMLAttributes } from "react";
import { cn } from "./utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid ? true : props["aria-invalid"]}
      className={cn(
        "erp-text-body-sm min-h-[var(--control-height-md)] rounded-[var(--radius-md)] border bg-[color:var(--field)] px-3 text-[color:var(--foreground)] shadow-[var(--shadow-xs)] outline-none transition-colors placeholder:text-[color:var(--muted)] disabled:opacity-60",
        invalid ? "border-[color:var(--danger)]" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]",
        className,
      )}
    />
  );
}
