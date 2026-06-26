import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

export const buttonVariantClasses = {
  default:
    "border border-transparent bg-[color:var(--accent)] text-[color:var(--accent-contrast)] shadow-[0_8px_18px_rgba(37,99,235,0.18)] hover:bg-[color:var(--accent-strong)] hover:shadow-[0_10px_22px_rgba(37,99,235,0.22)]",
  primary:
    "border border-transparent bg-[color:var(--accent)] text-[color:var(--accent-contrast)] shadow-[0_8px_18px_rgba(37,99,235,0.18)] hover:bg-[color:var(--accent-strong)] hover:shadow-[0_10px_22px_rgba(37,99,235,0.22)]",
  secondary:
    "border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--foreground)] shadow-[var(--shadow-control)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--panel-raised)]",
  ghost:
    "border border-transparent bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--hover)] hover:text-[color:var(--accent-strong)]",
  danger:
    "border border-transparent bg-[color:var(--danger)] text-white shadow-[var(--shadow-control)] hover:brightness-95",
  outline:
    "border border-[color:var(--border-strong)] bg-transparent text-[color:var(--accent-strong)] shadow-[var(--shadow-control)] hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)]",
} as const;

export const buttonSizeClasses = {
  sm: "erp-text-caption min-h-[var(--control-height-sm)] px-3",
  md: "erp-text-body-sm min-h-[var(--control-height-md)] px-4",
  lg: "erp-text-body min-h-[var(--control-height-lg)] px-5",
} as const;

export type ButtonVariant = keyof typeof buttonVariantClasses;
export type ButtonSize = keyof typeof buttonSizeClasses;

export function buttonClassName({
  className,
  size = "md",
  variant = "primary",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return cn(
    "inline-flex max-w-full items-center justify-center gap-2 rounded-[9px] font-extrabold transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-px active:translate-y-0 disabled:translate-y-0 disabled:opacity-55",
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export function Button({
  children,
  className,
  disabled,
  isLoading = false,
  leadingIcon,
  loadingLabel = "Procesando",
  size = "md",
  trailingIcon,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={isLoading ? true : props["aria-busy"]}
      className={buttonClassName({ className, size, variant })}
      disabled={disabled || isLoading}
      type={type}
    >
      {leadingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {leadingIcon}
        </span>
      ) : null}
      <span className="min-w-0">{isLoading ? loadingLabel : children}</span>
      {trailingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}
