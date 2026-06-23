import type { ReactNode } from "react";
import { cn } from "./utils";

type FieldProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  required?: boolean;
};

export function Field({ children, className, description, error, htmlFor, label, required }: FieldProps) {
  const LabelTag = htmlFor ? "label" : "div";

  return (
    <div className={cn("grid gap-1.5", className)}>
      <LabelTag className="text-sm font-semibold text-[color:var(--foreground)]" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-[color:var(--danger)]">*</span> : null}
      </LabelTag>
      {children}
      {description ? <p className="text-xs leading-5 text-[color:var(--muted)]">{description}</p> : null}
      {error ? (
        <p aria-live="polite" className="text-xs leading-5 text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
