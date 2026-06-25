import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

export const buttonVariantClasses = {
  default:
    "border border-transparent bg-[color:var(--accent)] text-white shadow-[var(--shadow-xs)] hover:bg-[color:var(--accent-strong)]",
  primary:
    "border border-transparent bg-[color:var(--accent)] text-white shadow-[var(--shadow-xs)] hover:bg-[color:var(--accent-strong)]",
  secondary:
    "border border-[color:var(--border)] bg-[color:var(--panel)] text-[color:var(--foreground)] shadow-[var(--shadow-xs)] hover:bg-[color:var(--hover)]",
  ghost:
    "border border-transparent bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--hover)]",
  danger:
    "border border-transparent bg-[color:var(--danger)] text-white shadow-[var(--shadow-xs)] hover:brightness-95",
  outline:
    "border border-[color:var(--border-strong)] bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--hover)]",
} as const;

export const buttonSizeClasses = {
  sm: "erp-text-caption min-h-[var(--control-height-sm)] px-3",
  md: "erp-text-body-sm min-h-[var(--control-height-md)] px-3.5",
  lg: "erp-text-body min-h-[var(--control-height-lg)] px-4",
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
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-colors disabled:opacity-55",
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
      <span>{isLoading ? loadingLabel : children}</span>
      {trailingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}
