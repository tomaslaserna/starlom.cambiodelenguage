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
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <LabelTag className="erp-display-font erp-text-body-sm min-h-[1.125rem] font-semibold text-[#263246]" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-[color:var(--danger)]">*</span> : null}
      </LabelTag>
      {children}
      {description ? <p className="erp-text-caption text-[color:var(--muted)]">{description}</p> : null}
      {error ? (
        <p aria-live="polite" className="erp-text-caption text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
