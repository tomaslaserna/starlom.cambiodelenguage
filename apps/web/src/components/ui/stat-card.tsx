import type { ReactNode } from "react";
import { cn } from "./utils";

const toneClasses = {
  neutral: "border-[color:var(--border)]",
  accent: "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]",
  success: "border-[color:var(--success)] bg-[color:var(--success-subtle)]",
  warning: "border-[color:var(--warning)] bg-[color:var(--warning-subtle)]",
  danger: "border-[color:var(--danger)] bg-[color:var(--danger-subtle)]",
  info: "border-[color:var(--info)] bg-[color:var(--info-subtle)]",
} as const;

export type StatCardTone = keyof typeof toneClasses;

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  footer?: ReactNode;
  tone?: StatCardTone;
  className?: string;
};

export function StatCard({ className, detail, footer, label, tone = "neutral", value }: StatCardProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[color:var(--panel)] p-4 shadow-[var(--shadow-xs)]",
        toneClasses[tone],
        className,
      )}
    >
      <div className="text-sm font-medium text-[color:var(--muted)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-normal">{value}</div>
      {detail ? <div className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{detail}</div> : null}
      {footer ? <div className="mt-3 border-t border-[color:var(--border)] pt-3 text-xs">{footer}</div> : null}
    </section>
  );
}
