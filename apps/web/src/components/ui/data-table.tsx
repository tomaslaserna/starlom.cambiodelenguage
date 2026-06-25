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
        "overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--panel)] shadow-[var(--shadow-xs)]",
        className,
      )}
      {...props}
    >
      <div className="overflow-x-auto">
        <table
          {...tableProps}
          aria-label={tableLabel}
          className={cn("erp-text-body-sm w-full border-collapse text-left", tableProps?.className)}
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
  return <thead className={cn("erp-text-caption bg-[color:var(--table-header)] uppercase text-[color:var(--muted)]", className)} {...props} />;
}

export function DataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-[color:var(--border)]", className)} {...props} />;
}

export function DataTableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-[color:var(--table-row-hover)]", className)} {...props} />;
}

type Align = "left" | "center" | "right";

const alignClasses: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function DataTableHead({
  align = "left",
  className,
  scope = "col",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  return (
    <th
      className={cn("px-4 py-3 font-semibold", alignClasses[align], className)}
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
  return <td className={cn("px-4 py-3.5 align-middle", alignClasses[align], className)} {...props} />;
}
