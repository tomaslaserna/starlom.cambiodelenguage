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
        "erp-text-body-sm min-h-28 w-full rounded-[var(--radius-sm)] border bg-[color:var(--field)] px-3 py-2.5 font-normal text-[color:var(--foreground)] shadow-[var(--shadow-control)] outline-none transition-[background-color,border-color,box-shadow] placeholder:text-[color:var(--muted)] disabled:bg-[#f4f6f8] disabled:text-[#7b8797] disabled:opacity-75",
        invalid ? "border-[color:var(--danger)]" : "border-[color:var(--border-strong)] hover:border-[#9eacbd] focus:border-[color:var(--accent)]",
        className,
      )}
      suppressHydrationWarning
    />
  );
}
