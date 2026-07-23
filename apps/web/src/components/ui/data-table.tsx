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
        "min-w-0 overflow-hidden rounded-[14px] border border-[#dbe4ef] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_26px_rgba(15,23,42,0.045)]",
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
        "erp-text-caption border-b border-[#dfe6ef] bg-[#fbfcfe] uppercase text-[#526177] [&>tr]:h-11",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-[#e4eaf2] [&>tr]:h-[58px]", className)} {...props} />;
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
        "h-11 whitespace-nowrap px-4 py-2.5 font-semibold tracking-[0.035em] first:pl-5 last:pr-5",
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
        "px-4 py-2.5 align-middle font-normal leading-[1.35] text-[#172033] first:pl-5 last:pr-5",
        alignClasses[align],
        className,
      )}
      {...props}
    />
  );
}
