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
        "overflow-hidden rounded-[8px] border border-[#e2e8f0] bg-white shadow-[var(--shadow-xs)]",
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
  return <thead className={cn("erp-text-caption border-b border-[#e2e8f0] bg-[#f8fafc] uppercase text-[#64748b]", className)} {...props} />;
}

export function DataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-[#edf2f7]", className)} {...props} />;
}

export function DataTableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-[#f8fafc]", className)} {...props} />;
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
      className={cn("px-4 py-3 font-black tracking-[0.04em]", alignClasses[align], className)}
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
  return <td className={cn("px-4 py-3 align-middle font-semibold text-[#172033]", alignClasses[align], className)} {...props} />;
}
