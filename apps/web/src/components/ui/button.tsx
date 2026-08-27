import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

const primaryButtonClass = "border border-transparent bg-[color:var(--accent)] text-[color:var(--accent-contrast)] shadow-[0_1px_2px_rgba(30,64,175,0.16),0_4px_10px_rgba(37,99,235,0.12)] hover:bg-[color:var(--accent-strong)] hover:shadow-[0_2px_4px_rgba(30,64,175,0.15),0_6px_14px_rgba(37,99,235,0.14)]";
const secondaryButtonClass = "border border-[#a9c7f4] bg-white text-[#0a55bd] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(23,105,232,0.045)] hover:border-[#72a4ec] hover:bg-[#f3f8ff]";
const outlineButtonClass = "border border-[#c3d2e5] bg-white text-[#33445f] shadow-[0_1px_2px_rgba(15,23,42,0.035)] hover:border-[#9db2cc] hover:bg-[#f7f9fc] hover:text-[#13213a]";
const ghostButtonClass = "border border-transparent bg-transparent text-[#334155] shadow-none hover:border-[#dbe3ec] hover:bg-[#f5f7fa] hover:text-[#0f172a]";
const dangerButtonClass = "border border-[#fecaca] bg-[#fff1f2] text-[#b4232f] shadow-[0_1px_2px_rgba(127,29,29,0.04)] hover:border-[#fda4af] hover:bg-[#ffe4e6]";

export const buttonVariantClasses = { default: primaryButtonClass, primary: primaryButtonClass, secondary: secondaryButtonClass, ghost: ghostButtonClass, danger: dangerButtonClass, outline: outlineButtonClass } as const;
export const buttonSizeClasses = {
  sm: "erp-text-body-sm h-[var(--control-height-sm)] min-h-[var(--control-height-sm)] px-3.5",
  md: "erp-text-body-sm h-[var(--control-height-md)] min-h-[var(--control-height-md)] px-4",
  lg: "erp-text-body h-[var(--control-height-lg)] min-h-[var(--control-height-lg)] px-5",
} as const;

export type ButtonVariant = keyof typeof buttonVariantClasses;
export type ButtonSize = keyof typeof buttonSizeClasses;

export function buttonClassName({ className, size = "md", variant = "primary" }: { className?: string; size?: ButtonSize; variant?: ButtonVariant }) {
  return cn("erp-display-font inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] align-middle font-semibold leading-none tracking-[-0.01em] transition-[background-color,border-color,box-shadow,color,transform] hover:-translate-y-px active:translate-y-0 active:shadow-none disabled:translate-y-0 disabled:opacity-55", buttonVariantClasses[variant], buttonSizeClasses[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; isLoading?: boolean; loadingLabel?: string; leadingIcon?: ReactNode; trailingIcon?: ReactNode };

export function Button({ children, className, disabled, isLoading = false, leadingIcon, loadingLabel = "Procesando", size = "md", trailingIcon, type = "button", variant = "primary", ...props }: ButtonProps) {
  return (
    <button {...props} aria-busy={isLoading ? true : props["aria-busy"]} className={buttonClassName({ className, size, variant })} disabled={disabled || isLoading} suppressHydrationWarning type={type}>
      {leadingIcon ? <span aria-hidden="true" className="shrink-0">{leadingIcon}</span> : null}
      <span className="min-w-0">{isLoading ? loadingLabel : children}</span>
      {trailingIcon ? <span aria-hidden="true" className="shrink-0">{trailingIcon}</span> : null}
    </button>
  );
}
