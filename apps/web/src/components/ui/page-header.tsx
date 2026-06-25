import type { ReactNode } from "react";
import { cn } from "./utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

export function PageHeader({ actions, className, description, eyebrow, meta, title }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 md:flex-row md:items-start md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="erp-text-caption font-semibold uppercase text-[color:var(--muted)]">{eyebrow}</div> : null}
        <h1 className="erp-text-page-title font-semibold tracking-normal">{title}</h1>
        {description ? <p className="erp-text-body-sm mt-1 max-w-3xl text-[color:var(--muted)]">{description}</p> : null}
        {meta ? <div className="erp-text-caption mt-3 text-[color:var(--muted)]">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
