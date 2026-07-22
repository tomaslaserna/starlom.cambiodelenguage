import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "./utils";

type DataTableProps = HTMLAttributes<HTMLDivElement> & {
  tableLabel: string;
  caption?: ReactNode;
  children: ReactNode;
  minWidth?: string;
  tableProps?: TableHTMLAttributes<HTMLTableElement>;
};

export function DataTable({
  caption,
  children,
  className,
  minWidth = "760px",
  tableLabel,
  tableProps,
  ...props
}: DataTableProps) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[12px] border border-[color:var(--border)] bg-white shadow-[var(--shadow-xs)]",
        className,
      )}
      {...props}
    >
      <div className="overflow-x-auto overscroll-x-contain">
        <table
          {...tableProps}
          aria-label={tableLabel}
          className={cn("erp-text-body-sm w-full border-collapse text-left text-[#1e293b] tabular-nums", tableProps?.className)}
          style={{ minWidth, ...tableProps?.style }}
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          {children}
        </table>
      </div>
    </div>
  );
}

export function DataTableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "erp-text-caption border-b border-[color:var(--border)] bg-[color:var(--table-header)] uppercase text-[#526177] [&>tr]:h-10",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-[color:var(--border)] [&>tr]:h-[52px]", className)} {...props} />;
}

export function DataTableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors duration-150 hover:bg-[color:var(--table-row-hover)] focus-within:bg-[color:var(--table-row-hover)]",
        className,
      )}
      {...props}
    />
  );
}

type Align = "left" | "center" | "right";

const alignClasses: Record<Align, string> = {
  left: "text-left",
  center: "text-center tabular-nums",
  right: "text-right tabular-nums",
};

export function DataTableHead({
  align = "left",
  className,
  scope = "col",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap px-4 py-2 font-semibold tracking-[0.035em] first:pl-5 last:pr-5",
        alignClasses[align],
        className,
      )}
      scope={scope}
      {...props}
    />
  );
}

export function DataTableCell({
  align = "left",
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  return (
    <td
      className={cn(
        "px-4 py-2 align-middle font-normal leading-[1.3] text-[#172033] first:pl-5 last:pr-5",
        alignClasses[align],
        className,
      )}
      {...props}
    />
  );
}
