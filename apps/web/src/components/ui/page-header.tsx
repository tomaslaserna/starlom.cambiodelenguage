import type { ReactNode } from "react";
import { cn } from "./utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  moduleIntro?: boolean;
  className?: string;
};

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  meta,
  moduleIntro = false,
  title,
}: PageHeaderProps) {
  if (moduleIntro) {
    if (!actions) return null;

    return (
      <div className={cn("erp-action-cluster justify-end", className)}>
        {actions}
      </div>
    );
  }

  return (
    <header
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--panel)] px-5 py-5 shadow-[var(--shadow-xs)] md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <div className="erp-text-caption mb-1 font-semibold uppercase tracking-[0.04em] text-[#1d4ed8]">{eyebrow}</div> : null}
        <h2 className="text-[1.625rem] font-extrabold leading-8 tracking-[-0.03em] text-[color:var(--foreground)]">{title}</h2>
        {description ? <p className="erp-text-body-sm mt-1 max-w-3xl font-normal text-[color:var(--muted)]">{description}</p> : null}
        {meta ? <div className="erp-text-caption mt-3 font-medium text-[color:var(--muted)]">{meta}</div> : null}
      </div>
      {actions ? <div className="erp-action-cluster shrink-0">{actions}</div> : null}
    </header>
  );
}
