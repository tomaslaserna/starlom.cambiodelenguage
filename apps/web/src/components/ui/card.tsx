import type { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative min-w-0 rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color:var(--panel)] shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-t-[17px] border-b border-[color:var(--border)] bg-[linear-gradient(135deg,#f8fbff_0%,#f3f7fc_100%)] px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("erp-text-title-sm font-bold tracking-[-0.015em] text-[color:var(--foreground)]", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("erp-text-body-sm mt-1 font-normal text-[color:var(--muted)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />;
}
