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
        "erp-text-body-sm min-h-[var(--control-height-md)] rounded-[8px] border bg-white px-3 font-normal text-[#172033] shadow-[var(--shadow-control)] outline-none transition-[background-color,border-color,box-shadow] placeholder:font-normal placeholder:text-[#64748b] disabled:bg-[#f4f6f8] disabled:text-[#7b8797] disabled:opacity-75",
        invalid ? "border-[color:var(--danger)]" : "border-[color:var(--border-strong)] hover:border-[#9eacbd] focus:border-[color:var(--accent)]",
        className,
      )}
      suppressHydrationWarning
    />
  );
}
