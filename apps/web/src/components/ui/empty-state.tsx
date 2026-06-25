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
    <div className={cn("flex flex-col items-center justify-center px-4 py-10 text-center", className)}>
      {icon ? <div className="mb-3 text-[color:var(--muted)]">{icon}</div> : null}
      <h2 className="erp-text-body-sm font-semibold">{title}</h2>
      {description ? <p className="erp-text-body-sm mt-1 max-w-md text-[color:var(--muted)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
