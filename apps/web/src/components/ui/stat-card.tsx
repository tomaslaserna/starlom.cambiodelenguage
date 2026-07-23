import type { ReactNode } from "react";
import { cn } from "./utils";

const toneClasses = {
  neutral: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#f1f5f9]",
    marker: "text-[#64748b]",
  },
  accent: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#eff6ff]",
    marker: "text-[#2563eb]",
  },
  success: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#ecfdf5]",
    marker: "text-[#059669]",
  },
  warning: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#fff7ed]",
    marker: "text-[#d97706]",
  },
  danger: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#fef2f2]",
    marker: "text-[#dc2626]",
  },
  info: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#f0f9ff]",
    marker: "text-[#0284c7]",
  },
} as const;

export type StatCardTone = keyof typeof toneClasses;

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  footer?: ReactNode;
  icon?: ReactNode;
  tone?: StatCardTone;
  className?: string;
};

export function StatCard({ className, detail, footer, icon, label, tone = "neutral", value }: StatCardProps) {
  const toneClass = toneClasses[tone];

  return (
    <section
      className={cn(
        "relative min-h-[112px] rounded-[14px] border px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_24px_rgba(15,23,42,0.05)]",
        toneClass.card,
        className,
      )}
    >
      <div className="flex min-h-[76px] items-center gap-4">
        <span
          aria-hidden="true"
          className={cn("flex h-13 w-13 shrink-0 items-center justify-center rounded-full", toneClass.markerShell, toneClass.marker)}
        >
          {icon ?? <span className="h-2.5 w-2.5 rounded-full bg-current" />}
        </span>
        <div className="min-w-0">
          <div className="erp-text-body-sm font-semibold text-[#526177]">{label}</div>
          <div className="mt-1 text-[1.65rem] font-bold leading-8 tracking-[-0.03em] text-[#0f172a] tabular-nums">{value}</div>
          {detail ? <div className="erp-text-caption mt-1 min-h-4 break-words font-normal text-[#64748b]">{detail}</div> : null}
        </div>
      </div>
      {footer ? <div className="erp-text-caption mt-3 border-t border-[color:var(--border)] pt-3">{footer}</div> : null}
    </section>
  );
}
