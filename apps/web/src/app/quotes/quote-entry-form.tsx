"use client";

import { useActionState, type ReactNode } from "react";
import type { CreateQuoteState } from "@/lib/quote-form-state";

const initialCreateQuoteState: CreateQuoteState = { ok: false };

type QuoteEntryFormProps = {
  action: (previousState: CreateQuoteState, formData: FormData) => Promise<CreateQuoteState>;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function QuoteEntryForm({ action, children, className, id }: QuoteEntryFormProps) {
  const [state, formAction] = useActionState(action, initialCreateQuoteState);

  return (
    <form action={formAction} className={className} id={id}>
      {state.error ? (
        <div
          className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--danger)]"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}
      {children}
    </form>
  );
}
