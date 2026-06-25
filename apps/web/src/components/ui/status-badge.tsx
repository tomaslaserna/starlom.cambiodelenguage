import type { HTMLAttributes } from "react";
import { cn } from "./utils";

const toneClasses = {
  neutral: "border-[color:var(--border)] bg-[color:var(--panel-subtle)] text-[color:var(--foreground)]",
  accent: "border-[color:var(--accent)] bg-[color:var(--accent-subtle)] text-[color:var(--accent-strong)]",
  success: "border-[color:var(--success)] bg-[color:var(--success-subtle)] text-[color:var(--success)]",
  warning: "border-[color:var(--warning)] bg-[color:var(--warning-subtle)] text-[color:var(--warning)]",
  danger: "border-[color:var(--danger)] bg-[color:var(--danger-subtle)] text-[color:var(--danger)]",
  info: "border-[color:var(--info)] bg-[color:var(--info-subtle)] text-[color:var(--info)]",
} as const;

export type StatusBadgeTone = keyof typeof toneClasses;

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusBadgeTone;
};

export function StatusBadge({ className, tone = "neutral", ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "erp-text-caption inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 font-semibold",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
