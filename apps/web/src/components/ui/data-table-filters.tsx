"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TableColumn = {
  index: number;
  label: string;
  isDate: boolean;
};

const DATE_COLUMN_PATTERN = /\b(fecha|date|venc\w*|periodo|plazo|alta|baja|entrega|compra|venta|emision)\b/i;
const DATE_VALUE_PATTERN = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/;

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();
}

function dateValue(value: string) {
  const match = value.trim().match(DATE_VALUE_PATTERN);
  if (!match) return null;

  const [, isoYear, isoMonth, isoDay, localDay, localMonth, localYear] = match;
  const year = Number(isoYear ?? localYear);
  const month = Number(isoMonth ?? localMonth);
  const day = Number(isoDay ?? localDay);
  if (!year || !month || !day) return null;

  const normalizedYear = year < 100 ? 2000 + year : year;
  const candidate = new Date(Date.UTC(normalizedYear, month - 1, day));
  if (
    candidate.getUTCFullYear() !== normalizedYear ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(normalizedYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rowCells(row: HTMLTableRowElement) {
  return Array.from(row.cells).filter((cell) => cell.colSpan === 1);
}

function dataRows(table: HTMLTableElement, columnCount: number) {
  return Array.from(table.tBodies).flatMap((body) =>
    Array.from(body.rows).filter((row) => row.dataset.dataTableFilterEmpty !== "true" && rowCells(row).length >= columnCount),
  );
}

function createEmptyRow(table: HTMLTableElement, columnCount: number) {
  const body = table.tBodies.item(0);
  if (!body) return null;

  const row = document.createElement("tr");
  row.dataset.dataTableFilterEmpty = "true";
  row.hidden = true;
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.className = "px-5 py-8 text-center text-sm text-[color:var(--muted)]";
  cell.textContent = "No hay filas que coincidan con los filtros.";
  row.append(cell);
  body.append(row);
  return row;
}

export function DataTableFilters() {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [query, setQuery] = useState("");
  const [columnIndex, setColumnIndex] = useState("all");
  const [exactValue, setExactValue] = useState("all");
  const [dateColumnIndex, setDateColumnIndex] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibleRows, setVisibleRows] = useState<number | null>(null);
  const [valueOptions, setValueOptions] = useState<string[]>([]);

  const dateColumns = useMemo(() => columns.filter((column) => column.isDate), [columns]);
  useEffect(() => {
    const table = rootRef.current?.closest<HTMLElement>("[data-data-table]")?.querySelector("table");
    const selectedIndex = Number(columnIndex);
    if (!table || !Number.isInteger(selectedIndex)) {
      setValueOptions([]);
      return;
    }

    const nextValueOptions = Array.from(
      new Set(
        dataRows(table, columns.length)
          .map((row) => rowCells(row)[selectedIndex]?.textContent?.replace(/\s+/g, " ").trim() ?? "")
          .filter(Boolean),
      ),
    )
      .sort((left, right) => left.localeCompare(right, "es-AR", { numeric: true, sensitivity: "base" }))
      .slice(0, 150);
    setValueOptions(nextValueOptions);
  }, [columnIndex, columns]);

  useEffect(() => {
    const table = rootRef.current?.closest<HTMLElement>("[data-data-table]")?.querySelector("table");
    if (!table) return;

    const nextColumns = Array.from(table.tHead?.querySelectorAll("th[scope='col']") ?? []).map((header, index) => {
      const label = header.textContent?.replace(/\s+/g, " ").trim() || `Columna ${index + 1}`;
      return { index, label, isDate: DATE_COLUMN_PATTERN.test(label) };
    });
    setColumns(nextColumns);
    setDateColumnIndex((current) => current || String(nextColumns.find((column) => column.isDate)?.index ?? ""));
  }, []);

  useEffect(() => {
    const table = rootRef.current?.closest<HTMLElement>("[data-data-table]")?.querySelector("table");
    if (!table || columns.length === 0) return;

    const normalizedQuery = normalizedText(query);
    const selectedColumn = columnIndex === "all" ? null : Number(columnIndex);
    const selectedDateColumn = dateColumnIndex === "" ? null : Number(dateColumnIndex);
    const rows = dataRows(table, columns.length);
    const emptyRow = createEmptyRow(table, columns.length);
    let matches = 0;

    for (const row of rows) {
      const cells = rowCells(row);
      const allText = normalizedText(cells.map((cell) => cell.textContent ?? "").join(" "));
      const selectedText = selectedColumn === null ? allText : normalizedText(cells[selectedColumn]?.textContent ?? "");
      const selectedDate = selectedDateColumn === null ? null : dateValue(cells[selectedDateColumn]?.textContent ?? "");
      const isVisible =
        (!normalizedQuery || selectedText.includes(normalizedQuery)) &&
        (exactValue === "all" || (cells[selectedColumn ?? -1]?.textContent ?? "").replace(/\s+/g, " ").trim() === exactValue) &&
        (!dateFrom || (selectedDate !== null && selectedDate >= dateFrom)) &&
        (!dateTo || (selectedDate !== null && selectedDate <= dateTo));

      row.hidden = !isVisible;
      if (isVisible) matches += 1;
    }

    if (emptyRow) emptyRow.hidden = matches !== 0;
    setVisibleRows(matches);

    return () => {
      for (const row of rows) row.hidden = false;
      emptyRow?.remove();
    };
  }, [columnIndex, columns, dateColumnIndex, dateFrom, dateTo, exactValue, query]);

  function clearFilters() {
    setQuery("");
    setColumnIndex("all");
    setExactValue("all");
    setDateFrom("");
    setDateTo("");
  }

  const activeFilters = Boolean(query || columnIndex !== "all" || exactValue !== "all" || dateFrom || dateTo);

  return (
    <details className="border-b border-[color:var(--border)] bg-[color:var(--panel-subtle)] px-3 py-2" ref={rootRef}>
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-sm)] px-1 text-xs font-bold text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--panel)] [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-semibold text-[color:var(--muted)]">
          {visibleRows === null ? "Filtros de tabla" : `${visibleRows} fila${visibleRows === 1 ? "" : "s"} visible${visibleRows === 1 ? "" : "s"}`}
        </span>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border-strong)] bg-white px-3">
          <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M4 6h16M7 12h10m-7 6h4" strokeLinecap="round" />
          </svg>
          Filtrar{activeFilters ? " · activo" : ""}
        </span>
      </summary>

      <div className="mt-3 border-t border-[color:var(--border)] pt-3">
        {activeFilters ? (
          <div className="mb-3 flex justify-end">
            <button className="text-xs font-semibold text-[color:var(--accent-strong)] hover:underline" onClick={clearFilters} type="button">
              Limpiar filtros
            </button>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-[color:var(--muted)]">
            Buscar
            <input className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm font-normal text-[color:var(--foreground)]" onChange={(event) => setQuery(event.target.value)} placeholder="Texto a buscar" type="search" value={query} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[color:var(--muted)]">
            Columna
            <select className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm font-normal text-[color:var(--foreground)]" onChange={(event) => { setColumnIndex(event.target.value); setExactValue("all"); }} value={columnIndex}>
              <option value="all">Todas las columnas</option>
              {columns.map((column) => <option key={column.index} value={column.index}>{column.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[color:var(--muted)]">
            Valor exacto
            <select className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm font-normal text-[color:var(--foreground)]" disabled={columnIndex === "all"} onChange={(event) => setExactValue(event.target.value)} value={exactValue}>
              <option value="all">Cualquier valor</option>
              {valueOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {dateColumns.length ? (
            <label className="grid gap-1 text-xs font-semibold text-[color:var(--muted)]">
              Fecha
              <select className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm font-normal text-[color:var(--foreground)]" onChange={(event) => setDateColumnIndex(event.target.value)} value={dateColumnIndex}>
                {dateColumns.map((column) => <option key={column.index} value={column.index}>{column.label}</option>)}
              </select>
            </label>
          ) : null}
          {dateColumns.length ? (
            <label className="grid gap-1 text-xs font-semibold text-[color:var(--muted)]">
              Desde
              <input className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm font-normal text-[color:var(--foreground)]" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
            </label>
          ) : null}
          {dateColumns.length ? (
            <label className="grid gap-1 text-xs font-semibold text-[color:var(--muted)]">
              Hasta
              <input className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm font-normal text-[color:var(--foreground)]" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
            </label>
          ) : null}
        </div>
      </div>
    </details>
  );
}
