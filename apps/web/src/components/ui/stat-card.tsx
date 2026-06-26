import type { ReactNode } from "react";
import { cn } from "./utils";

const toneClasses = {
  neutral: {
    card: "border-[#d9e2ef] bg-white",
    marker: "bg-[#94a3b8]",
  },
  accent: {
    card: "border-[#bfdbfe] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]",
    marker: "bg-[#2563eb]",
  },
  success: {
    card: "border-[#bbf7d0] bg-[linear-gradient(180deg,#ffffff_0%,#f7fef9_100%)]",
    marker: "bg-[#16a34a]",
  },
  warning: {
    card: "border-[#fde68a] bg-[linear-gradient(180deg,#ffffff_0%,#fffaf0_100%)]",
    marker: "bg-[#d97706]",
  },
  danger: {
    card: "border-[#fecaca] bg-[linear-gradient(180deg,#ffffff_0%,#fff7f7_100%)]",
    marker: "bg-[#dc2626]",
  },
  info: {
    card: "border-[#bae6fd] bg-[linear-gradient(180deg,#ffffff_0%,#f0f9ff_100%)]",
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
        "relative overflow-hidden rounded-[10px] border p-4 shadow-[0_10px_28px_rgba(15,23,42,0.055)]",
        toneClass.card,
        className,
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", toneClass.marker)} />
      <div className="erp-text-caption font-black uppercase text-[#64748b]">{label}</div>
      <div className="mt-2 text-[1.625rem] font-black leading-8 tracking-normal text-[#0f172a]">{value}</div>
      {detail ? <div className="erp-text-caption mt-2 min-h-4 font-semibold text-[#64748b]">{detail}</div> : null}
      {footer ? <div className="erp-text-caption mt-3 border-t border-[color:var(--border)] pt-3">{footer}</div> : null}
    </section>
  );
}
