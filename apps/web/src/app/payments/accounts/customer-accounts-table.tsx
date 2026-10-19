"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { cn, EmptyState } from "@/components/ui";
import type { OpenCustomerAccount } from "@/lib/customer-accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { customerAccountSituation, customerAccountAging } from "@/lib/customer-account-presentation";

export function CustomerAccountsTable({ accounts, searching }: { accounts: OpenCustomerAccount[]; searching: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px] border-collapse text-sm" aria-label="Cuentas corrientes de clientes">
        <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-3">Cliente</th>
            <th scope="col" className="px-4 py-3">Situación</th>
            <th scope="col" className="px-5 py-3 text-right">Saldo</th>
            <th scope="col" className="w-[124px] px-5 py-3"><span className="sr-only">Detalle</span></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const status = customerAccountSituation(account);
            const open = expanded === account.clientId;
            const name = account.name || "Sin nombre";
            return (
              <Fragment key={account.clientId}>
                <tr className={cn("border-t border-slate-100 transition-colors hover:bg-slate-50/60", open && "bg-blue-50/30")}>
                  <td className="px-5 py-4">
                    <Link className="block font-semibold text-slate-900 underline-offset-2 hover:text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500" href={`/payments/accounts/${account.clientId}`}>{name}</Link>
                    <span className="mt-1 block text-xs text-slate-500">{account.sellerName || "Sin vendedor"} · Últ. mov. {formatDate(account.lastMovementDate)}</span>
                  </td>
                  <td className="px-4 py-4"><span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", status.className)}>{status.label}</span></td>
                  <td className="whitespace-nowrap px-5 py-4 text-right">
                    <strong className={cn("text-base font-semibold tracking-tight tabular-nums", account.balance < 0 ? "text-emerald-700" : "text-slate-900")}>{formatCurrency(Math.abs(account.balance))}</strong>
                    {account.balance < 0 ? <span className="mt-0.5 block text-[11px] text-emerald-700">a favor</span> : null}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" onClick={() => setExpanded(open ? null : account.clientId)} aria-expanded={open} aria-controls={`aging-${account.clientId}`} aria-label={`${open ? "Ocultar" : "Ver"} detalle de ${name}`} className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500">
                      {open ? "Cerrar" : "Ver detalle"}<span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
                    </button>
                  </td>
                </tr>
                <tr id={`aging-${account.clientId}`} hidden={!open}>
                  <td colSpan={4} className="border-t border-blue-100 bg-blue-50/30 px-5 py-5">
                    <p className="text-xs font-semibold text-slate-700">Antigüedad del saldo</p>
                    {account.balance > 0 ? (
                      <>
                        <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(135px,1fr))] gap-2">
                          {customerAccountAging(account.aging).map(({ label, amount }) => (
                            <div key={label} className={cn("min-w-0 rounded-lg border p-3", amount > 0 ? "border-slate-200 bg-white" : "border-transparent bg-slate-100/60")}>
                              <dt className="text-xs text-slate-500">{label}</dt>
                              <dd className={cn("mt-2 whitespace-nowrap text-sm font-semibold tabular-nums", amount > 0 ? "text-slate-900" : "text-slate-400")}>{formatCurrency(amount)}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="mt-3 text-xs text-slate-500">La etiqueta de situación indica el tramo más antiguo con saldo.</p>
                      </>
                    ) : <p className="mt-2 text-sm text-slate-600">{account.balance < 0 ? "El cliente tiene saldo a favor. No hay deuda pendiente de cobro." : "La cuenta está saldada. Su historial sigue disponible para consulta."}</p>}
                    <Link className="mt-4 inline-flex min-h-9 items-center text-sm font-semibold text-blue-700 underline-offset-2 hover:underline" href={`/payments/accounts/${account.clientId}`}>Abrir cuenta corriente →</Link>
                  </td>
                </tr>
              </Fragment>
            );
          })}
          {accounts.length === 0 ? <tr><td colSpan={4} className="px-5 py-8"><EmptyState title={searching ? "Sin resultados" : "Sin cuentas abiertas"} description={searching ? "No encontramos cuentas corrientes para ese cliente o CUIT." : "No hay clientes con saldo abierto. Podés buscar un cliente para consultar su historial."} /></td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
