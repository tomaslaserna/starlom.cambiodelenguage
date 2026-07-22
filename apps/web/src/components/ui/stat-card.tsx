import type { ReactNode } from "react";
import { cn } from "./utils";

const toneClasses = {
  neutral: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#f1f5f9]",
    marker: "bg-[#64748b]",
  },
  accent: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#eff6ff]",
    marker: "bg-[#2563eb]",
  },
  success: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#ecfdf5]",
    marker: "bg-[#059669]",
  },
  warning: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#fff7ed]",
    marker: "bg-[#d97706]",
  },
  danger: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#fef2f2]",
    marker: "bg-[#dc2626]",
  },
  info: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#f0f9ff]",
    marker: "bg-[#0284c7]",
  },
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
  const toneClass = toneClasses[tone];

  return (
    <section
      className={cn(
        "relative min-h-24 rounded-[12px] border px-4 py-3.5 shadow-[var(--shadow-xs)]",
        toneClass.card,
        className,
      )}
    >
      <div className="flex min-h-[64px] items-center gap-3">
        <span
          aria-hidden="true"
          className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", toneClass.markerShell)}
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", toneClass.marker)} />
        </span>
        <div className="min-w-0">
          <div className="erp-text-caption font-semibold text-[#526177]">{label}</div>
          <div className="erp-text-page-title mt-0.5 font-bold tracking-[-0.025em] text-[#0f172a] tabular-nums">{value}</div>
          {detail ? <div className="erp-text-caption mt-0.5 min-h-4 break-words font-normal text-[#64748b]">{detail}</div> : null}
        </div>
      </div>
      {footer ? <div className="erp-text-caption mt-3 border-t border-[color:var(--border)] pt-3">{footer}</div> : null}
    </section>
  );
}
