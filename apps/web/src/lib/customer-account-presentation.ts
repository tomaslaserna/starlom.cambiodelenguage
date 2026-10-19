import type { AgingBuckets, OpenCustomerAccount } from "./customer-accounts";

export function customerAccountAging(aging: AgingBuckets) {
  return [
    { label: "Al día", amount: aging.current },
    { label: "1–7 días", amount: aging.d7 },
    { label: "8–15 días", amount: aging.d15 },
    { label: "16–30 días", amount: aging.d30 },
    { label: "+30 días", amount: aging.d30Plus },
  ];
}

/** Sólo presentación: conserva el saldo y los tramos calculados por el servicio contable. */
export function customerAccountSituation(account: Pick<OpenCustomerAccount, "balance" | "aging">) {
  if (account.balance < 0) return { label: "A favor", className: "bg-emerald-50 text-emerald-700 ring-emerald-100" };
  if (account.balance === 0) return { label: "Saldada", className: "bg-slate-100 text-slate-600 ring-slate-200" };
  if (account.aging.d30Plus > 0) return { label: "+30 días", className: "bg-rose-50 text-rose-700 ring-rose-100" };
  if (account.aging.d30 > 0) return { label: "16–30 días", className: "bg-amber-50 text-amber-800 ring-amber-100" };
  if (account.aging.d15 > 0) return { label: "8–15 días", className: "bg-amber-50 text-amber-800 ring-amber-100" };
  if (account.aging.d7 > 0) return { label: "1–7 días", className: "bg-sky-50 text-sky-700 ring-sky-100" };
  return { label: "Al día", className: "bg-slate-100 text-slate-600 ring-slate-200" };
}
