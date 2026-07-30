"use client";

import { useActionState, type ReactNode } from "react";
import {
  initialOrderEntryActionState,
  type OrderEntryActionState,
} from "@/app/orders/order-entry-action-state";

type OrderEntryFormProps = {
  action: (
    previousState: OrderEntryActionState,
    formData: FormData,
  ) => Promise<OrderEntryActionState>;
  children: ReactNode;
  className?: string;
};

export function OrderEntryForm({ action, children, className }: OrderEntryFormProps) {
  const [state, formAction] = useActionState(action, initialOrderEntryActionState);

  return (
    <form action={formAction} className={className}>
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
