import type { HTMLAttributes } from "react";
import { cn } from "./utils";

const toneClasses = {
  neutral: "border-[#d6dee8] bg-[#f6f8fa] text-[#334155]",
  accent: "border-[#bfd4fb] bg-[#eef4ff] text-[#1d4ed8]",
  success: "border-[#a7e3bd] bg-[#edf9f1] text-[#08783b]",
  warning: "border-[#f3cf94] bg-[#fff7e8] text-[#a44b08]",
  danger: "border-[#f3b7b7] bg-[#fff0f0] text-[#b42318]",
  info: "border-[#abd8f0] bg-[#eef8fd] text-[#086d9c]",
} as const;

export type StatusBadgeTone = keyof typeof toneClasses;

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusBadgeTone;
};

export function StatusBadge({ className, tone = "neutral", ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "erp-text-caption inline-flex min-h-6 items-center justify-center rounded-full border px-2.5 py-0.5 font-semibold leading-none tabular-nums",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
