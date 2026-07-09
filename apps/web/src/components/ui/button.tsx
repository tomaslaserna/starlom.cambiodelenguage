import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

const primaryButtonClass =
  "border border-transparent bg-[color:var(--accent)] text-[color:var(--accent-contrast)] shadow-[0_8px_18px_rgba(37,99,235,0.18)] hover:bg-[color:var(--accent-strong)] hover:shadow-[0_10px_22px_rgba(37,99,235,0.22)]";
const secondaryButtonClass =
  "border border-[#1d4ed8] bg-[#1d4ed8] text-white shadow-[0_7px_16px_rgba(29,78,216,0.14)] hover:bg-[#1e40af] hover:shadow-[0_9px_20px_rgba(29,78,216,0.18)]";
const outlineButtonClass =
  "border border-[#93c5fd] bg-[#dbeafe] text-[#0b4fc7] shadow-[0_4px_12px_rgba(37,99,235,0.08)] hover:border-[#60a5fa] hover:bg-[#bfdbfe]";
const ghostButtonClass =
  "border border-[#bfdbfe] bg-[#eff6ff] text-[#075ac7] shadow-none hover:border-[#93c5fd] hover:bg-[#dbeafe]";
const dangerButtonClass =
  "border border-[#073f94] bg-[#073f94] text-white shadow-[0_7px_16px_rgba(7,63,148,0.16)] hover:bg-[#052f70]";
const buttonSizeClass = "erp-text-body-sm min-h-[var(--control-height-md)] px-4";

export const buttonVariantClasses = {
  default: primaryButtonClass,
  primary: primaryButtonClass,
  secondary: secondaryButtonClass,
  ghost: ghostButtonClass,
  danger: dangerButtonClass,
  outline: outlineButtonClass,
} as const;

export const buttonSizeClasses = {
  sm: buttonSizeClass,
  md: buttonSizeClass,
  lg: buttonSizeClass,
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
    "inline-flex max-w-full items-center justify-center gap-2 rounded-[9px] font-bold transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-px active:translate-y-0 disabled:translate-y-0 disabled:opacity-55",
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
      suppressHydrationWarning
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
