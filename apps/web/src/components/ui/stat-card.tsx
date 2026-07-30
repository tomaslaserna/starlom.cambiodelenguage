import type { ReactNode } from "react";
import { cn } from "./utils";

const toneClasses = {
  neutral: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#f1f5f9]",
    marker: "bg-[#64748b]",
    icon: "text-[#526177]",
  },
  accent: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#eff6ff]",
    marker: "bg-[#2563eb]",
    icon: "text-[#2563eb]",
  },
  success: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#ecfdf5]",
    marker: "bg-[#059669]",
    icon: "text-[#059669]",
  },
  warning: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#fff7ed]",
    marker: "bg-[#d97706]",
    icon: "text-[#c96a04]",
  },
  danger: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#fef2f2]",
    marker: "bg-[#dc2626]",
    icon: "text-[#dc2626]",
  },
  info: {
    card: "border-[#dbe3ec] bg-white",
    markerShell: "bg-[#f0f9ff]",
    marker: "bg-[#0284c7]",
    icon: "text-[#0284c7]",
  },
} as const;

export type StatCardTone = keyof typeof toneClasses;

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  detail?: ReactNode;
  footer?: ReactNode;
  tone?: StatCardTone;
  className?: string;
};

export function StatCard({ className, detail, footer, icon, label, tone = "neutral", value }: StatCardProps) {
  const toneClass = toneClasses[tone];

  return (
    <section
      className={cn(
        "relative flex min-h-[6.75rem] items-center rounded-[var(--radius-lg)] border px-4 py-3.5 shadow-[var(--shadow-xs)]",
        toneClass.card,
        className,
      )}
    >
      <div className="grid w-full grid-cols-[48px_minmax(0,1fr)] items-center gap-3.5">
        <span
          aria-hidden="true"
          className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/[0.025]", toneClass.markerShell)}
        >
          {icon ? (
            <span className={cn("flex h-5 w-5 items-center justify-center [&>svg]:h-5 [&>svg]:w-5", toneClass.icon)}>
              {icon}
            </span>
          ) : (
            <span className={cn("h-2.5 w-2.5 rounded-full", toneClass.marker)} />
          )}
        </span>
        <div className="flex min-w-0 flex-col justify-center">
          <div className="erp-text-caption truncate font-semibold leading-[1.15] text-[#526177]">{label}</div>
          <div className="mt-1 whitespace-nowrap font-mono text-[clamp(1.15rem,1.55vw,1.7rem)] font-black leading-none tracking-[-0.04em] text-[color:var(--foreground)] tabular-nums">
            {value}
          </div>
          <div
            aria-hidden={detail ? undefined : true}
            className="erp-text-caption mt-1 min-h-4 truncate font-normal text-[color:var(--muted)]"
          >
            {detail ?? "\u00a0"}
          </div>
        </div>
      </div>
      {footer ? <div className="erp-text-caption mt-3 border-t border-[color:var(--border)] pt-3">{footer}</div> : null}
    </section>
  );
}
