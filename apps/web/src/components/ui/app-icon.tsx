import type { SVGProps } from "react";
import { cn } from "./utils";

export type AppIconName =
  | "calendar"
  | "cart"
  | "chart"
  | "clock"
  | "download"
  | "filter"
  | "invoice"
  | "money"
  | "package"
  | "quote"
  | "receipt"
  | "refresh"
  | "search"
  | "trend"
  | "units"
  | "wallet"
  | "warning";

type AppIconProps = SVGProps<SVGSVGElement> & {
  name: AppIconName;
};

export function AppIcon({ className, name, ...props }: AppIconProps) {
  const content = {
    calendar: (
      <>
        <rect height="16" rx="2" width="18" x="3" y="5" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </>
    ),
    cart: (
      <>
        <path d="M3 4h2l2.3 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.7L20.5 7H6" />
        <circle cx="10" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7" />
        <path d="M2 20h20" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v11" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 20h14" />
      </>
    ),
    filter: <path d="M4 5h16l-6.2 7.1v5.7l-3.6 1.8v-7.5L4 5Z" />,
    invoice: (
      <>
        <rect height="18" rx="2" width="14" x="5" y="3" />
        <path d="M8 7h8M8 11h8M8 15h5" />
      </>
    ),
    money: (
      <>
        <path d="M12 2v20M16.5 6.5c-.8-1-2.2-1.5-4-1.5-2.3 0-4 1.2-4 3s1.3 2.7 4 3.2 4 1.5 4 3.3-1.7 3.5-4.5 3.5c-2 0-3.6-.7-4.5-1.8" />
      </>
    ),
    package: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9M8 5.2l8 4.5" />
      </>
    ),
    quote: (
      <>
        <rect height="16" rx="2" width="16" x="4" y="4" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </>
    ),
    receipt: (
      <>
        <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21V3Z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 6v5h-5M4 18v-5h5" />
        <path d="M18.2 9A7 7 0 0 0 6.4 6.4L4 9M5.8 15A7 7 0 0 0 17.6 17.6L20 15" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    trend: <path d="m4 17 6-6 4 4 6-8M15 7h5v5" />,
    units: (
      <>
        <rect height="8" rx="1" width="3" x="4" y="12" />
        <rect height="13" rx="1" width="3" x="10.5" y="7" />
        <rect height="17" rx="1" width="3" x="17" y="3" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v13H6a2 2 0 0 1-2-2V6.5Z" />
        <path d="M4 8h16M15 12h6v4h-6a2 2 0 0 1 0-4Z" />
      </>
    ),
    warning: (
      <>
        <path d="M10.3 4.3 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v5M12 17.5h.01" />
      </>
    ),
  }[name];

  return (
    <svg
      aria-hidden="true"
      className={cn("h-5 w-5", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {content}
    </svg>
  );
}
