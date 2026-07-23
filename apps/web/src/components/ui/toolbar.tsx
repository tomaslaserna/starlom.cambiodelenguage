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
        "flex flex-col gap-4 rounded-[14px] border border-[#dbe4ef] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_24px_rgba(15,23,42,0.045)] sm:p-5 md:flex-row md:flex-wrap md:items-center md:justify-between",
        className,
      )}
      role="region"
      {...props}
    />
  );
}
