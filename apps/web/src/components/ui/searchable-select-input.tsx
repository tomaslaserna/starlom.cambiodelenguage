"use client";

import { useState } from "react";
import { SearchableSelect, type SearchableSelectOption } from "./searchable-select";

type SearchableSelectInputProps = {
  id: string;
  name: string;
  options: SearchableSelectOption[];
  placeholder: string;
  defaultValue?: string;
  emptyMessage?: string;
  required?: boolean;
};

export function SearchableSelectInput({
  defaultValue = "",
  emptyMessage,
  id,
  name,
  options,
  placeholder,
  required,
}: SearchableSelectInputProps) {
  const [value, setValue] = useState(defaultValue);
  return (
    <SearchableSelect
      emptyMessage={emptyMessage}
      id={id}
      name={name}
      options={options}
      placeholder={placeholder}
      required={required}
      value={value}
      onChange={setValue}
    />
  );
}
