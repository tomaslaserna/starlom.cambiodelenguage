import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { buttonClassName, type ButtonSize, type ButtonVariant } from "./button";

type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  LinkProps & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
  };

export function ButtonLink({
  children,
  className,
  leadingIcon,
  size = "md",
  trailingIcon,
  variant = "primary",
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ className, size, variant })} {...props}>
      {leadingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {leadingIcon}
        </span>
      ) : null}
      <span>{children}</span>
      {trailingIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {trailingIcon}
        </span>
      ) : null}
    </Link>
  );
}
