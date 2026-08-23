import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

const primaryButtonClass =
  "border border-transparent bg-[color:var(--accent)] text-[color:var(--accent-contrast)] shadow-[0_1px_2px_rgba(30,64,175,0.16),0_4px_10px_rgba(37,99,235,0.12)] hover:bg-[color:var(--accent-strong)] hover:shadow-[0_2px_4px_rgba(30,64,175,0.15),0_6px_14px_rgba(37,99,235,0.14)]";
const secondaryButtonClass =
  "border border-[#1d4ed8] bg-[#1d4ed8] text-white shadow-[0_1px_2px_rgba(30,64,175,0.14),0_4px_10px_rgba(29,78,216,0.11)] hover:border-[#1e40af] hover:bg-[#1e40af] hover:shadow-[0_2px_4px_rgba(30,64,175,0.15),0_6px_14px_rgba(29,78,216,0.14)]";
const outlineButtonClass =
  "border border-[#b8cdf1] bg-white text-[#1755b8] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-[#8fb1e8] hover:bg-[#f5f8ff]";
const ghostButtonClass =
  "border border-transparent bg-transparent text-[#334155] shadow-none hover:border-[#dbe3ec] hover:bg-[#f5f7fa] hover:text-[#0f172a]";
const dangerButtonClass =
  "border border-[#b91c1c] bg-[#b91c1c] text-white shadow-[0_1px_2px_rgba(127,29,29,0.14),0_4px_10px_rgba(185,28,28,0.11)] hover:border-[#991b1b] hover:bg-[#991b1b]";

export const buttonVariantClasses = {
  default: primaryButtonClass,
  primary: primaryButtonClass,
  secondary: secondaryButtonClass,
  ghost: ghostButtonClass,
  danger: dangerButtonClass,
  outline: outlineButtonClass,
} as const;

export const buttonSizeClasses = {
  sm: "erp-text-body-sm h-[var(--control-height-sm)] min-h-[var(--control-height-sm)] px-3.5",
  md: "erp-text-body-sm h-[var(--control-height-md)] min-h-[var(--control-height-md)] px-4",
  lg: "erp-text-body h-[var(--control-height-lg)] min-h-[var(--control-height-lg)] px-5",
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
    "inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] align-middle font-bold leading-none transition-[background-color,border-color,box-shadow,color,transform] active:translate-y-px active:shadow-none disabled:translate-y-0 disabled:opacity-55",
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
