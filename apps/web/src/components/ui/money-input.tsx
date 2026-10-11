"use client";

import { useState, type InputHTMLAttributes } from "react";
import { normalizeCurrencyInput } from "@/lib/format";
import { Input } from "./input";
import { cn } from "./utils";

type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "inputMode" | "max" | "min" | "name" | "onChange" | "step" | "type" | "value"
> & {
  defaultValue?: string | number;
  max?: string | number;
  min?: string | number;
  name?: string;
  onValueChange?: (value: string) => void;
  value?: string | number;
};

function numericLimit(value: string | number | undefined) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function MoneyInput({
  className,
  defaultValue = "",
  disabled,
  max,
  min,
  name,
  onBlur,
  onFocus,
  onValueChange,
  placeholder = "0,00",
  readOnly,
  required,
  value,
  ...props
}: MoneyInputProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(() => normalizeCurrencyInput(defaultValue, true));
  const [editingValue, setEditingValue] = useState(internalValue);
  const [focused, setFocused] = useState(false);
  const normalized = focused
    ? editingValue
    : controlled
      ? normalizeCurrencyInput(value, true)
      : internalValue;

  function update(nextText: string, finalize = false) {
    const next = normalizeCurrencyInput(nextText, finalize);
    setEditingValue(next);
    if (!controlled) setInternalValue(next);
    onValueChange?.(next.raw);
    return next;
  }

  return (
    <span className="relative block">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center font-semibold text-[color:var(--muted)]">
        $
      </span>
      <Input
        {...props}
        className={cn("pl-7 tabular-nums", className)}
        disabled={disabled}
        inputMode="decimal"
        onBlur={(event) => {
          const next = update(event.currentTarget.value, true);
          setFocused(false);
          const numericValue = Number(next.raw);
          const minimum = numericLimit(min);
          const maximum = numericLimit(max);
          event.currentTarget.setCustomValidity(
            next.raw && minimum !== null && numericValue < minimum
              ? `El monto mínimo es $ ${normalizeCurrencyInput(minimum, true).display}`
              : next.raw && maximum !== null && numericValue > maximum
                ? `El monto máximo es $ ${normalizeCurrencyInput(maximum, true).display}`
                : "",
          );
          onBlur?.(event);
        }}
        onChange={(event) => {
          event.currentTarget.setCustomValidity("");
          update(event.currentTarget.value);
        }}
        onFocus={(event) => {
          setEditingValue(normalizeCurrencyInput(event.currentTarget.value));
          setFocused(true);
          event.currentTarget.select();
          onFocus?.(event);
        }}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        type="text"
        value={normalized.display}
      />
      {name ? <input disabled={disabled} name={name} readOnly={readOnly} type="hidden" value={normalized.raw} /> : null}
    </span>
  );
}
