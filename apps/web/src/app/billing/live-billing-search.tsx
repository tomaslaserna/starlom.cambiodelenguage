"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui";

type LiveBillingSearchProps = {
  defaultValue?: string;
};

const SEARCH_DELAY_MS = 250;

export function LiveBillingSearch({ defaultValue = "" }: LiveBillingSearchProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const currentValue = searchParams.get("q") ?? "";
    if (value.trim() === currentValue) return;

    const timeout = window.setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams.toString());
      const nextValue = value.trim();

      if (nextValue) nextParams.set("q", nextValue);
      else nextParams.delete("q");

      nextParams.delete("page");
      nextParams.delete("cliente");
      nextParams.delete("nro_id");
      nextParams.delete("nro_factura");

      startTransition(() => {
        const query = nextParams.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    }, SEARCH_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [pathname, router, searchParams, value]);

  return (
    <Input
      autoComplete="off"
      id="billing-query"
      name="q"
      onChange={(event) => setValue(event.target.value)}
      placeholder="Cliente, CUIT/DNI o comprobante"
      type="search"
      value={value}
    />
  );
}
