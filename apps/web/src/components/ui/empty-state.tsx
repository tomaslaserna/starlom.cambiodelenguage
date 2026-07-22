import type { ReactNode } from "react";
import { cn } from "./utils";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function EmptyState({ action, className, description, icon, title }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-5 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f5f9] text-[#64748b]">
          {icon}
        </div>
      ) : null}
      <h2 className="erp-text-body font-semibold tracking-[-0.01em] text-[#1e293b]">{title}</h2>
      {description ? <p className="erp-text-body-sm mt-1 max-w-md font-normal text-[#64748b]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
