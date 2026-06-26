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
    <header
      className={cn(
        "flex flex-col gap-4 rounded-[10px] border border-[#d9e2ef] bg-white px-5 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.055)] md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <div className="erp-text-caption mb-1 font-black uppercase text-[#1d4ed8]">{eyebrow}</div> : null}
        <h1 className="erp-text-page-title font-black tracking-normal text-[#0f172a]">{title}</h1>
        {description ? <p className="erp-text-body-sm mt-1 max-w-3xl font-semibold text-[#64748b]">{description}</p> : null}
        {meta ? <div className="erp-text-caption mt-3 font-semibold text-[#64748b]">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}
