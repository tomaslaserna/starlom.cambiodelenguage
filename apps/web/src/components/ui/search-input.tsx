import type { ComponentProps } from "react";
import { AppIcon } from "./app-icon";
import { Input } from "./input";
import { cn } from "./utils";

type SearchInputProps = ComponentProps<typeof Input>;

export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div className="relative min-w-0">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[#71819a]">
        <AppIcon className="h-[18px] w-[18px]" name="search" />
      </span>
      <Input className={cn("w-full pl-10", className)} {...props} />
    </div>
  );
}
