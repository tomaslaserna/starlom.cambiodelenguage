"use client";

import { useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { rankSearchOptions } from "@/lib/search-options";
import { cn } from "./utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
};

type SearchableSelectProps = {
  id: string;
  name?: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  maxResults?: number;
  compactOptions?: boolean;
};

export function SearchableSelect({
  id,
  name,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = "Escribi para buscar",
  emptyMessage = "No hay coincidencias",
  disabled,
  required,
  className,
  maxResults = 40,
  compactOptions = false,
}: SearchableSelectProps) {
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(
    () => rankSearchOptions(options, open ? search : "", maxResults),
    [maxResults, open, options, search],
  );
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, results.length - 1));
  const displayedValue = open ? search : selected?.label ?? "";

  function choose(option: SearchableSelectOption) {
    onChange(option.value);
    setSearch("");
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && open && results[safeActiveIndex]) {
      event.preventDefault();
      choose(results[safeActiveIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSearch("");
      setOpen(false);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (wrapperRef.current?.contains(event.relatedTarget as Node | null)) return;
    setSearch("");
    setOpen(false);
  }

  return (
    <div className={cn("relative min-w-0", className)} onBlur={handleBlur} ref={wrapperRef}>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <input
        aria-activedescendant={open && results[safeActiveIndex] ? `${listboxId}-${safeActiveIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        autoComplete="off"
        className="erp-text-body-sm min-h-[var(--control-height-md)] w-full rounded-[8px] border border-[color:var(--border-strong)] bg-white px-3 font-normal text-[#172033] shadow-[var(--shadow-control)] outline-none transition-[border-color,box-shadow] placeholder:text-[#64748b] hover:border-[#9eacbd] focus:border-[color:var(--accent)] disabled:bg-[#f4f6f8] disabled:text-[#7b8797] disabled:opacity-75"
        disabled={disabled}
        id={id}
        onChange={(event) => {
          setSearch(event.target.value);
          setActiveIndex(0);
          setOpen(true);
          if (value) onChange("");
        }}
        onFocus={() => {
          setSearch("");
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={selected ? undefined : searchPlaceholder || placeholder}
        role="combobox"
        value={displayedValue}
      />
      {open ? (
        <div
          className={cn(
            "absolute z-50 mt-1.5 w-full min-w-[280px] overflow-y-auto rounded-[10px] border border-[color:var(--border)] bg-white p-1.5 shadow-[var(--shadow-md)]",
            compactOptions ? "max-h-[min(24rem,50vh)]" : "max-h-72",
          )}
          id={listboxId}
          role="listbox"
        >
          {!compactOptions && !search && !value ? (
            <div className="px-2.5 py-1.5 text-xs font-medium text-[color:var(--muted)]">{placeholder}</div>
          ) : null}
          {results.length ? (
            results.map((option, index) => (
              <button
                aria-selected={option.value === value}
                className={cn(
                  "erp-text-body-sm w-full rounded-[var(--radius-sm)] text-left",
                  compactOptions
                    ? "flex min-h-8 items-center px-2.5 py-1"
                    : "grid gap-0.5 px-2.5 py-1.5",
                  index === safeActiveIndex
                    ? "bg-[color:var(--accent-subtle)] text-[color:var(--foreground)]"
                    : "hover:bg-[color:var(--panel-subtle)]",
                )}
                id={`${listboxId}-${index}`}
                key={option.value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                role="option"
                type="button"
              >
                <span className={cn("font-semibold", compactOptions && "min-w-0 truncate")}>{option.label}</span>
                {!compactOptions && option.description ? (
                  <span className="text-xs text-[color:var(--muted)]">{option.description}</span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-[color:var(--muted)]">{emptyMessage}</div>
          )}
          {options.length > results.length ? (
            <div className="border-t border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--muted)]">
              Mostrando {results.length} coincidencias. Segui escribiendo para precisar.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
