import type { HTMLAttributes } from "react";
import { cn } from "./utils";

type ToolbarProps = HTMLAttributes<HTMLDivElement> & {
  ariaLabel?: string;
};

export function Toolbar({ ariaLabel = "Herramientas", className, ...props }: ToolbarProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--panel)] p-3 shadow-[var(--shadow-xs)] md:flex-row md:items-center md:justify-between",
        className,
      )}
      role="region"
      {...props}
    />
  );
}
