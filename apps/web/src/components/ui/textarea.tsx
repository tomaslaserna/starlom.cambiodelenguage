import type { TextareaHTMLAttributes } from "react";
import { cn } from "./utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid ? true : props["aria-invalid"]}
      className={cn(
        "erp-text-body-sm min-h-28 rounded-[var(--radius-md)] border bg-[color:var(--field)] px-3 py-2 text-[color:var(--foreground)] shadow-[var(--shadow-xs)] outline-none transition-colors placeholder:text-[color:var(--muted)] disabled:opacity-60",
        invalid ? "border-[color:var(--danger)]" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]",
        className,
      )}
    />
  );
}
